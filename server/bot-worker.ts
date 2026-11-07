import type { Game } from '../shared/types';
import { act, expireUno, normalize, view } from './engine';
import { pool, transaction } from './db';
import { BOT_DELAY, botDecision } from './bots';
export async function botStep(code: string, now = Date.now()): Promise<boolean> {
 return transaction(async client => {
  const r = await client.query('SELECT state,version FROM rooms WHERE code=$1 FOR UPDATE SKIP LOCKED', [code]);
  if (!r.rowCount) return false;
  const g = normalize(r.rows[0].state as Game), p = g.players[g.turn];
  if (g.status !== 'playing' || !p?.bot || (g.botNextAt ?? 0) > now) return false;
  const decision = botDecision(view(g, p.id, code, r.rows[0].version));
  if (!decision) return false;
  act(g, p.id, decision); g.botNextAt = now + BOT_DELAY;
  const version = r.rows[0].version + 1;
  await client.query('UPDATE rooms SET state=$2,version=$3,updated_at=now() WHERE code=$1', [code, JSON.stringify(g), version]);
  await client.query('INSERT INTO game_events(room_code,version,player_id,action) VALUES($1,$2,$3,$4)', [code, version, p.id, JSON.stringify(decision)]);
  return true;
 });
}

export async function unoTimeoutStep(code: string, now = Date.now()): Promise<boolean> {
 return transaction(async client => {
  const r = await client.query('SELECT state,version FROM rooms WHERE code=$1 FOR UPDATE SKIP LOCKED', [code]);
  if (!r.rowCount) return false;
  const g = normalize(r.rows[0].state as Game);
  const expired = expireUno(g, now);
  if (!expired.length) return false;
  const version = r.rows[0].version + 1;
  await client.query('UPDATE rooms SET state=$2,version=$3,updated_at=now() WHERE code=$1', [code, JSON.stringify(g), version]);
  await client.query('INSERT INTO game_events(room_code,version,player_id,action) VALUES($1,$2,$3,$4)', [code, version, g.host, JSON.stringify({ type: 'uno_timeout', players: expired })]);
  return true;
 });
}

// The timer holds no game state. Reloading/restarting recovers due bot turns from PostgreSQL.
export function startBotWorker(broadcast: (room: string) => Promise<void>): () => void {
 let running = false, stopped = false, reported = false;
 const tick = async () => {
  if (running || stopped) return;
  running = true;
  try {
   const overdue = await pool.query(`SELECT code FROM rooms WHERE state->>'status'='playing'
    AND EXISTS (SELECT 1 FROM jsonb_each_text(COALESCE(state->'unoDeadlines','{}'::jsonb)) d WHERE d.value::bigint<=$1)
    ORDER BY updated_at LIMIT 20`, [Date.now()]);
   for (const { code } of overdue.rows) {
    if (stopped) break;
    if (await unoTimeoutStep(code)) await broadcast(code);
   }
   const r = await pool.query(`SELECT code FROM rooms
    WHERE state->>'status'='playing'
      AND state->'players'->((state->>'turn')::int)->>'bot'='true'
      AND COALESCE((state->>'botNextAt')::bigint,0)<=$1
    ORDER BY updated_at LIMIT 20`, [Date.now()]);
   for (const { code } of r.rows) {
    if (stopped) break;
    if (await botStep(code)) await broadcast(code);
   }
   reported = false;
  } catch {
   if (!reported && !stopped) console.error('Chưa xử lý được lượt máy. Kiểm tra PostgreSQL; server sẽ tự thử lại.');
   reported = true;
  } finally { running = false; }
 };
 const timer = setInterval(() => void tick(), 250); timer.unref();
 return () => { stopped = true; clearInterval(timer); };
}

