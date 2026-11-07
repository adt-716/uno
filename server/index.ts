import express from 'express';
import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Server } from 'socket.io';
import { z } from 'zod';
import { pool, hash, transaction } from './db';
import { act, empty, normalize, view } from './engine';
import { BOT_DELAY, soloGame } from './bots';
import { startBotWorker } from './bot-worker';
import type { Game } from '../shared/types';
import { allColors } from '../shared/types';
const app=express();const http=createServer(app);
const io=new Server(http,{cors:{origin:process.env.CLIENT_ORIGIN??'http://localhost:5173'},maxHttpBufferSize:8192});
app.use('/img',express.static(resolve('img')));
app.get('/api/health',async(_req,res)=>{try{await pool.query('SELECT 1 FROM rooms LIMIT 1');res.json({ok:true,database:'postgresql'});}catch{res.status(503).json({ok:false,error:'Chưa kết nối PostgreSQL hoặc chưa migrate.'});}});
app.use(express.static(resolve('dist')));
app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/index.html')));
const roomCode=z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
const entrance=z.object({name:z.string().trim().min(1).max(24),code:roomCode.optional(),mode:z.enum(['classic','flip']).default('classic'),kind:z.enum(['online','solo']).default('online'),maxPlayers:z.number().int().min(2).max(10).default(10)});
const action=z.object({type:z.enum(['start','play','draw','pass','catch','uno','chooseColor','accept','challenge']),cardId:z.string().max(40).optional(),color:z.enum(allColors).optional(),uno:z.boolean().optional(),target:z.uuid().optional(),version:z.number().int().nonnegative()});
const token=z.string().regex(/^[a-f0-9]{64}$/);
const code=()=>Array.from({length:6},()=> 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join('');
type Identity={code:string;id:string};
async function identify(secret:string):Promise<Identity>{const r=await pool.query('SELECT player_id,room_code FROM player_sessions WHERE token_hash=$1',[hash(secret)]);if(!r.rowCount)throw new Error('Phiên không tồn tại. Hãy tạo hoặc vào phòng.');return {code:r.rows[0].room_code,id:r.rows[0].player_id};}
async function current(who:Identity){const r=await pool.query('SELECT state,version FROM rooms WHERE code=$1',[who.code]);if(!r.rowCount)throw new Error('Phòng không tồn tại.');return view(r.rows[0].state,who.id,who.code,r.rows[0].version);}
async function broadcast(room:string){const r=await pool.query('SELECT state,version FROM rooms WHERE code=$1',[room]);if(!r.rowCount)return;for(const s of await io.in(room).fetchSockets()){const who=s.data.identity as Identity|undefined;if(who)s.emit('state',view(r.rows[0].state,who.id,room,r.rows[0].version));}}
io.on('connection',socket=>{
 // Limits are transport metadata only; room/game/session state always comes from PostgreSQL.
 let windowStart=Date.now(),requests=0;
 const wrap=(fn:(data:any)=>Promise<unknown>)=>async(data:unknown,ack:unknown)=>{
  if(typeof ack!=='function')return;
  if(Date.now()-windowStart>10000){windowStart=Date.now();requests=0;}
  if(++requests>40){ack({ok:false,error:'Thao tác quá nhanh. Hãy thử lại sau.'});return;}
  try{ack({ok:true,...await fn(data) as object});}catch(e){const message=e instanceof z.ZodError?'Dữ liệu không hợp lệ.':e instanceof Error&&!('code' in e)?e.message:'Không thể truy cập PostgreSQL. Kiểm tra .env và chạy db:migrate.';ack({ok:false,error:message});}
 };
 async function attach(who:Identity){for(const r of socket.rooms)if(r!==socket.id)await socket.leave(r);socket.data.identity=who;await socket.join(who.code);}
 socket.on('enter',wrap(async data=>{
  const input=entrance.parse(data);const id=randomUUID(),secret=randomBytes(32).toString('hex');const room=input.code??code();
  await transaction(async c=>{
   if(input.code){const r=await c.query('SELECT state FROM rooms WHERE code=$1 FOR UPDATE',[room]);if(!r.rowCount)throw new Error('Không tìm thấy phòng.');const g=normalize(r.rows[0].state as Game);if(g.kind==='solo')throw new Error('Đây là bàn chơi với máy, không thể tham gia bằng mã.');if(g.status==='playing')throw new Error('Ván đang chơi, hãy đợi ván sau.');if(g.players.length>=g.maxPlayers)throw new Error(`Phòng đã đủ ${g.maxPlayers} người.`);g.players.push({id,name:input.name,hand:[],uno:false,score:0});await c.query('UPDATE rooms SET state=$2,version=version+1,updated_at=now() WHERE code=$1',[room,JSON.stringify(g)]);}
   else {
    const g=input.kind==='solo'?soloGame(id,input.name,input.mode):empty(id,input.name,input.mode);
    if(input.kind==='solo'){act(g,id,{type:'start'});g.botNextAt=Date.now()+BOT_DELAY;}
    else g.maxPlayers=input.maxPlayers;
    await c.query('INSERT INTO rooms(code,state,version) VALUES($1,$2,$3)',[room,JSON.stringify(g),input.kind==='solo'?1:0]);
    if(input.kind==='solo')await c.query('INSERT INTO game_events(room_code,version,player_id,action) VALUES($1,1,$2,$3)',[room,id,JSON.stringify({type:'start'})]);
   }
   await c.query('INSERT INTO player_sessions(token_hash,player_id,room_code) VALUES($1,$2,$3)',[hash(secret),id,room]);
  });const who={id,code:room};await attach(who);await broadcast(room);return {token:secret,state:await current(who)};
 }));
 socket.on('resume',wrap(async data=>{const who=await identify(token.parse(data));await attach(who);return {state:await current(who)};}));
 socket.on('action',wrap(async data=>{
  const input=action.parse(data);const who=socket.data.identity as Identity|undefined;if(!who)throw new Error('Hãy vào phòng trước.');
  await transaction(async c=>{const r=await c.query('SELECT state,version FROM rooms WHERE code=$1 FOR UPDATE',[who.code]);if(!r.rowCount)throw new Error('Phòng không tồn tại.');if(r.rows[0].version!==input.version)throw new Error('Trạng thái đã thay đổi. Hãy thử lại.');const g=r.rows[0].state as Game;act(g,who.id,input);g.botNextAt=Date.now()+BOT_DELAY;const version=input.version+1;await c.query('UPDATE rooms SET state=$2,version=$3,updated_at=now() WHERE code=$1',[who.code,JSON.stringify(g),version]);await c.query('INSERT INTO game_events(room_code,version,player_id,action) VALUES($1,$2,$3,$4)',[who.code,version,who.id,JSON.stringify(input)]);});await broadcast(who.code);return {state:await current(who)};
 }));
});
export { http, io };
http.on('listening', () => { const stop = startBotWorker(broadcast); http.once('close', stop); });
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
 http.listen(Number(process.env.PORT??3001),'0.0.0.0',()=>console.log('UNO server: http://localhost:'+ (process.env.PORT??3001)));
}
async function shutdown(){io.close();http.close();await pool.end();process.exit(0);}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
