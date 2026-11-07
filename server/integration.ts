import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io as connect, type Socket } from 'socket.io-client';
import { http, io } from './index';
import { pool } from './db';
import type { Action, Game, Mode, View } from '../shared/types';
import { botDecision } from './bots';
import { deck, empty } from './engine';

// Creates only its own random-code rooms and removes those rooms in finally.
const ownedRooms: string[] = [], sockets: Socket[] = [];
const states = new Map<string, View>();
let url = '';
async function client(): Promise<Socket> {
 const s = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false, timeout: 8000 });
 sockets.push(s);
 await new Promise<void>((resolve, reject) => {
  s.once('connect', resolve); s.once('connect_error', reject); s.connect();
 });
 s.on('state', (v: View) => states.set(v.me, v)); return s;
}
async function raw(s: Socket, event: string, data: unknown): Promise<any> {
 return s.timeout(8000).emitWithAck(event, data);
}
async function request(s: Socket, event: string, data: unknown): Promise<any> {
 const r = await raw(s, event, data); assert.equal(r.ok, true, r.error);
 if (r.state) states.set(r.state.me, r.state); return r;
}
async function run(mode: Mode) {
 const first = await client(), second = await client();
 const created = await request(first, 'enter', { name: 'Integration host', mode });
 const code = created.state.code as string; ownedRooms.push(code);
 const joined = await request(second, 'enter', { name: 'Integration guest', code, mode: mode === 'flip' ? 'classic' : 'flip' });
 assert.equal(joined.state.mode, mode, 'room chooses mode, not joining client');
 let byId = new Map<string, Socket>([[created.state.me, first], [joined.state.me, second]]);
 const secrets = new Map<string, string>([[created.state.me, created.token], [joined.state.me, joined.token]]);
 const row = async () => (await pool.query('SELECT state, version FROM rooms WHERE code=$1', [code])).rows[0] as { state: Game; version: number };
 let saved = await row();
 await request(first, 'action', { type: 'start', version: saved.version });
 const send = async (id: string, action: Action) => { const saved = await row(); return request(byId.get(id)!, 'action', { ...action, version: saved.version }); };
 saved = await row();
 if (saved.state.choosingColor) await send(saved.state.choosingColor, { type: 'chooseColor', color: saved.state.side === 'dark' ? 'pink' : 'red' });
 saved = await row();
 const turnId = saved.state.players[saved.state.turn].id, actor = byId.get(turnId)!;
 const replies = await Promise.all([raw(actor, 'action', { type: 'draw', version: saved.version }), raw(actor, 'action', { type: 'draw', version: saved.version })]);
 assert.equal(replies.filter(r => r.ok).length, 1, 'concurrent same-version moves commit exactly once');
 assert.equal((await row()).version, saved.version + 1);

 let steps = 0, resumed = false;
 while ((saved = await row()).state.status === 'playing' && steps++ < 10000) {
  // Exercise the production rate limiter rather than disabling it for tests.
  await new Promise(resolve => setTimeout(resolve, 350));
  const g = saved.state, id = g.players[g.turn].id;
  if (!resumed && (g.pending || g.choosingColor || steps > 8)) {
   const old = byId.get(id)!; old.disconnect();
   const replacement = await client();
   const result = await request(replacement, 'resume', secrets.get(id));
   assert.equal(result.state.version, saved.version);
   assert.equal(result.state.side, g.side);
   assert.deepEqual(result.state.pending?.kind, g.pending?.kind);
   assert.equal(result.state.choosingColor, g.choosingColor);
   byId.set(id, replacement); resumed = true;
  }
  // Read only the player's public projection, never their opponent's hand.
  for (let wait = 0; states.get(id)?.version !== saved.version && wait < 100; wait++) await new Promise(resolve => setTimeout(resolve, 10));
  const v = states.get(id)!;
  assert.equal(v.version, saved.version, 'Socket.IO delivers committed version to next player');
  assert.equal('deck' in v, false); assert.equal('hand' in v.players.find(p => p.id !== id)!, false);
  if (v.pending) { assert.equal('guilty' in v.pending, false); await send(id, { type: steps % 3 ? 'accept' : 'challenge' }); }
  else if (v.choosingColor) await send(id, { type: 'chooseColor', color: v.side === 'dark' ? 'pink' : 'red' });
  else {
   const c = v.hand.find(c => (!v.drawn || v.drawn === c.id) && (c.color === 'wild' || c.color === v.color || c.value === v.top?.value));
   await send(id, c ? { type: 'play', cardId: c.id, color: v.side === 'dark' ? 'pink' : 'red', uno: true } : { type: v.drawn ? 'pass' : 'draw' });
  }
 }
 saved = await row(); assert.equal(saved.state.status, 'finished'); assert.ok(Number.isFinite(saved.state.roundPoints));
 const events = await pool.query('SELECT count(*)::int AS n FROM game_events WHERE room_code=$1', [code]);
 assert.equal(events.rows[0].n, saved.version - 1, 'one event per action; join increments version separately');
 console.log(mode + ': PostgreSQL persistence, full game, resume, private views, concurrent moves OK (' + steps + ' turns).');
}
async function capacity(mode: Mode, maxPlayers: number) {
 const host = await client();
 const created = await request(host, 'enter', { name: 'Capacity host', mode, maxPlayers });
 const code = created.state.code; ownedRooms.push(code);
 for (let i = 1; i < maxPlayers; i++) await request(await client(), 'enter', { name: 'Seat ' + i, code });
 const rejected = await raw(await client(), 'enter', { name: 'Overflow', code });
 assert.equal(rejected.ok, false); assert.match(rejected.error, /đủ/);
 const saved = (await pool.query('SELECT state,version FROM rooms WHERE code=$1', [code])).rows[0];
 assert.equal(saved.state.players.length, maxPlayers);
 await request(host, 'action', { type: 'start', version: saved.version });
 const started = (await pool.query('SELECT state FROM rooms WHERE code=$1', [code])).rows[0].state as Game;
 assert.ok(started.players.every(p => p.hand.length >= 7));
 const cards = [...started.deck, ...started.discard, ...started.players.flatMap(p => p.hand)];
 assert.equal(new Set(cards.map(c => c.id)).size, mode === 'classic' ? 108 : 112);
 console.log(mode + ': online capacity ' + maxPlayers + ', overflow rejected, deal OK.');
}
async function solo(mode: Mode) {
 let s = await client();
 const created = await request(s, 'enter', { name: 'Solo tester', kind: 'solo', mode });
 const code = created.state.code; ownedRooms.push(code);
 assert.equal(created.state.players.length, 4); assert.equal(created.state.players.filter((p: any) => p.bot).length, 3);
 assert.equal(created.state.status, 'playing'); assert.equal(created.state.maxPlayers, 4);
 const outsider = await raw(await client(), 'enter', { name: 'Outsider', code }); assert.equal(outsider.ok, false);
 const deadline = Date.now() + 25000;
 let humanMoved = false, resumed = false, botEvents = 0;
 while (Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const row = (await pool.query('SELECT state,version FROM rooms WHERE code=$1', [code])).rows[0];
  const g = row.state as Game;
  const events = await pool.query(`SELECT count(*)::int AS n FROM game_events e JOIN rooms r ON r.code=e.room_code
   WHERE r.code=$1 AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.state->'players') p WHERE p->>'id'=e.player_id::text AND p->>'bot'='true')`, [code]);
  botEvents = events.rows[0].n;
  if (g.status === 'finished' || (botEvents >= 3 && humanMoved && resumed)) break;
  if (g.players[g.turn].bot) {
   if (!resumed) {
    s.disconnect(); await new Promise(resolve => setTimeout(resolve, 1400));
    s = await client(); const restored = await request(s, 'resume', created.token);
    assert.equal(restored.state.kind, 'solo'); assert.ok(restored.state.version > row.version, 'bots continue while human disconnected');
    resumed = true;
   }
  } else {
   const r = await request(s, 'resume', created.token), v = r.state as View;
   const a = botDecision(v); assert.ok(a);
   await request(s, 'action', { ...a, version: v.version }); humanMoved = true;
  }
 }
 assert.ok(botEvents >= 3, 'worker persisted bot turns'); assert.ok(humanMoved); assert.ok(resumed);
 console.log(mode + ': solo four seats, durable bot worker, automatic turns and disconnected resume OK.');
}
async function unoTimer() {
 const host = await client(), guest = await client();
 const created = await request(host, 'enter', { name: 'UNO timer host' });
 const code = created.state.code; ownedRooms.push(code);
 const joined = await request(guest, 'enter', { name: 'UNO timer guest', code });
 // Deterministic fixture only in this newly-created disposable QA room.
 const g = empty(created.state.me, 'UNO timer host');
 g.players.push({ id: joined.state.me, name: 'UNO timer guest', hand: [], score: 0, uno: false });
 g.status = 'playing'; g.round = 1; g.deck = deck();
 const pick = (color: string, value: string) => g.deck.splice(g.deck.findIndex(c => c.color === color && c.value === value), 1)[0];
 g.players[0].hand = [pick('red', 'number_0'), pick('red', 'number_1')];
 g.players[1].hand = [pick('blue', 'number_2')]; g.discard = [pick('red', 'number_2')];
 await pool.query('UPDATE rooms SET state=$2 WHERE code=$1', [code, JSON.stringify(g)]);
 const current = await request(host, 'resume', created.token);
 const played = await request(host, 'action', { type: 'play', cardId: g.players[0].hand[1].id, version: current.state.version });
 const deadline = played.state.unoDeadlines[created.state.me];
 assert.ok(deadline - played.state.serverNow <= 5000 && deadline - played.state.serverNow > 4500);
 host.disconnect(); const rejoined = await client();
 const resumed = await request(rejoined, 'resume', created.token); assert.equal(resumed.state.unoDeadlines[created.state.me], deadline);
 const early = await raw(guest, 'action', { type: 'catch', target: created.state.me, version: resumed.state.version });
 assert.equal(early.ok, false, 'cannot catch before five seconds'); rejoined.disconnect();
 let saved: any;
 const end = Date.now() + 7000;
 do {
  await new Promise(resolve => setTimeout(resolve, 200));
  saved = (await pool.query('SELECT state,version FROM rooms WHERE code=$1', [code])).rows[0];
 } while (saved.state.players[0].hand.length === 1 && Date.now() < end);
 assert.equal(saved.state.players[0].hand.length, 3, 'worker applies two-card penalty while disconnected');
 assert.equal(saved.state.unoDeadlines[created.state.me], undefined);
 const events = await pool.query("SELECT count(*)::int AS n FROM game_events WHERE room_code=$1 AND action->>'type'='uno_timeout'", [code]);
 assert.equal(events.rows[0].n, 1);
 console.log('UNO: five-second deadline survives resume, rejects early catch, auto-penalizes exactly once while disconnected.');
}
try {
 await pool.query('SELECT 1 FROM rooms LIMIT 1');
 http.listen(0, '127.0.0.1'); await once(http, 'listening');
 url = 'http://127.0.0.1:' + (http.address() as { port: number }).port;
 await run('classic'); await run('flip');
 await capacity('classic', 10); await capacity('flip', 10); await capacity('classic', 2);
 await solo('classic'); await solo('flip');
 await unoTimer();
} catch (error) {
 const e = error as Error & { code?: string };
 console.error('Integration failed:', e.code ?? e.name, e.name === 'AssertionError' ? e.message : 'Kiểm tra PostgreSQL và schema.');
 process.exitCode = 1;
} finally {
 for (const s of sockets) s.disconnect();
 try { if (ownedRooms.length) await pool.query('DELETE FROM rooms WHERE code=ANY($1::text[])', [ownedRooms]); }
 finally { await new Promise<void>(resolve => io.close(() => resolve())); await pool.end(); }
}
