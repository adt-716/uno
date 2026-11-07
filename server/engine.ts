import { randomInt } from 'node:crypto';
import inventory from '../img/classic_deck_108.json';
import flipInventory from '../img/flip_deck_112.json';
import { colors, darkColors, type Action, type Card, type Color, type Face, type Game, type Mode, type PendingPenalty, type PublicCard, type View } from '../shared/types';

export function shuffle<T>(items: T[]): T[] {
 const result = [...items];
 for (let i = result.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [result[i], result[j]] = [result[j], result[i]];
 }
 return result;
}
function parseFace(image: string): Face {
 const parts = image.split('/');
 return { image, color: parts.at(-2) as Face['color'], value: parts.at(-1)!.replace('.png', '') };
}
export function deck(mode: Mode = 'classic'): Card[] {
 if (mode === 'flip') return flipInventory.map(c => ({ id: c.id, ...parseFace(c.light), light: parseFace(c.light), dark: parseFace(c.dark) }));
 return inventory.map(c => ({ id: c.id, ...parseFace(c.image) }));
}
export function face(g: Pick<Game, 'mode' | 'side'>, card: Card): Face {
 return g.mode === 'flip' ? card[g.side]! : card;
}
function publicCard(g: Game, c: Card): PublicCard {
 const f = face(g, c);
 return { id: c.id, image: f.image, color: f.color, value: f.value };
}
export function activeColors(g: Pick<Game, 'mode' | 'side'>): readonly Color[] {
 return g.mode === 'flip' && g.side === 'dark' ? darkColors : colors;
}
export function empty(host: string, name: string, mode: Mode = 'classic'): Game {
 return { status: 'waiting', mode, side: 'light', rulesVersion: 2, kind: 'online', maxPlayers: 10, host, dealer: 0, round: 0,
  players: [{ id: host, name, hand: [], uno: false, score: 0 }], deck: [], discard: [], turn: 0,
  direction: 1, color: 'red', placements: [], unoDeadlines: {}, log: ['Phòng đã được tạo.'] };
}
// Keep rooms created by the first release playable without discarding saved games.
export function normalize(g: Game): Game {
 g.mode ??= 'classic'; g.side ??= 'light'; g.dealer ??= 0; g.round ??= g.status === 'waiting' ? 0 : 1;
 g.kind ??= 'online'; g.maxPlayers ??= 10;
 g.unoDeadlines ??= {}; g.catchable = undefined;
 g.rulesVersion = 2;
 for (const p of g.players) p.score ??= 0;
 return g;
}
function demand(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function index(g: Game, from: number, steps = 1): number {
 let result = from;
 for (let step = 0; step < steps; step++) {
  for (let scanned = 0; scanned < g.players.length; scanned++) {
   result = (result + g.direction + g.players.length) % g.players.length;
   if (!g.placements?.includes(g.players[result].id)) break;
  }
 }
 return result;
}
function next(g: Game, steps = 1): void { g.turn = index(g, g.turn, steps); g.drawn = undefined; }
function take(g: Game, count: number): Card[] {
 const result: Card[] = [];
 for (let i = 0; i < count; i++) {
  if (!g.deck.length && g.discard.length > 1) {
   const top = g.discard.pop()!;
   g.deck = shuffle(g.discard); g.discard = [top];
  }
  const c = g.deck.pop();
  if (!c) break;
  result.push(c);
 }
 return result;
}
function drawFor(g: Game, id: string, count: number): void {
 const p = g.players.find(p => p.id === id)!;
 const cards = take(g, count);
 if (cards.length) {
  p.hand.push(...cards); p.uno = false;
  delete g.unoDeadlines[id];
 }
}
function drawPenalty(g: Game, id: string, kind: PendingPenalty['kind'], color: Color): void {
 if (kind !== 'wild_draw_color') { drawFor(g, id, kind === 'wild_draw_four' ? 4 : 2); return; }
 // Each card is removed permanently from the piles, so depletion cannot loop forever.
 const p = g.players.find(p => p.id === id)!;
 const before = p.hand.length;
 while (true) {
  const [c] = take(g, 1);
  if (!c) break;
  p.hand.push(c);
  if (face(g, c).color === color) break;
 }
 if (p.hand.length > before) {
  p.uno = false;
  delete g.unoDeadlines[id];
 }
}
export function playable(g: Game, c: Card): boolean {
 const f = face(g, c), top = g.discard.at(-1);
 return f.color === 'wild' || f.color === g.color || (!!top && f.value === face(g, top).value);
}
export function cardPoints(g: Game, c: Card): number {
 const v = face(g, c).value;
 if (v.startsWith('number_')) return Number(v.slice(7));
 if (g.mode === 'classic') return v.startsWith('wild') ? 50 : 20;
 return ({ draw_one: 10, draw_five: 20, reverse: 20, skip: 20, skip_everyone: 30,
  flip: 20, wild: 40, wild_draw_two: 50, wild_draw_color: 60 } as Record<string, number>)[v];
}
function finish(g: Game, id: string): void {
 const p = g.players.find(p => p.id === id)!;
 if (p.hand.length) return;
 if (g.placements) {
  if (g.placements.includes(id)) return;
  if (!g.placements.length) {
   g.winner = id;
   g.roundPoints = g.players.filter(other => other.id !== id).reduce((sum, other) => sum + other.hand.reduce((n, c) => n + cardPoints(g, c), 0), 0);
   p.score += g.roundPoints;
   if (p.score >= 500) g.champion = id;
  }
  g.placements.push(id); delete g.unoDeadlines[id]; p.uno = false;
  g.log.push(p.name + ' về hạng ' + g.placements.length + '.');
  const remaining = g.players.filter(other => !g.placements!.includes(other.id));
  if (remaining.length <= 1) {
   if (remaining.length) g.placements.push(remaining[0].id);
   g.status = 'finished'; g.drawn = undefined; g.unoDeadlines = {}; g.choosingColor = undefined;
   g.log.push('Đã xác định đủ thứ hạng. Ván kết thúc.');
  } else {
   if (g.players[g.turn].id === id) next(g);
   if (g.choosingColor) g.choosingColor = g.players[g.turn].id;
  }
  return;
 }
 g.roundPoints = g.players.filter(other => other.id !== id).reduce((sum, other) => sum + other.hand.reduce((n, c) => n + cardPoints(g, c), 0), 0);
 p.score += g.roundPoints;
 g.status = 'finished'; g.winner = id; g.drawn = undefined; g.unoDeadlines = {}; g.choosingColor = undefined;
 if (p.score >= 500) g.champion = id;
 g.log.push(p.name + ' thắng ván, +' + g.roundPoints + ' điểm.' + (g.champion ? ' Đã thắng trận 500 điểm!' : ''));
}
function flip(g: Game): void {
 g.side = g.side === 'light' ? 'dark' : 'light';
 g.deck.reverse(); g.discard.reverse();
 const top = face(g, g.discard.at(-1)!);
 // The newly exposed symbol is not played again. An exposed wild only needs a color.
 if (top.color === 'wild') g.choosingColor = g.players[g.turn].id;
 else g.color = top.color;
 g.log.push('Lật sang mặt ' + (g.side === 'dark' ? 'tối' : 'sáng') + '.');
}
function chooseDealer(g: Game): number {
 // Automated equivalent of drawing highest-number cards, with ties redrawn.
 let contenders = g.players.map((_, i) => i);
 while (contenders.length > 1) {
  const cards = shuffle(deck(g.mode));
  const results = contenders.map(player => { const f = face({ ...g, side: 'light' }, cards.pop()!); return { player, rank: f.value.startsWith('number_') ? Number(f.value.slice(7)) : 0 }; });
  const highest = Math.max(...results.map(r => r.rank));
  contenders = results.filter(r => r.rank === highest).map(r => r.player);
 }
 return contenders[0];
}
// Optional prepared deck/dealer makes opening action rules testable without random fixtures.
export function startRound(g: Game, cards = shuffle(deck(g.mode)), dealer = chooseDealer(g)): void {
 if (g.champion) { g.players.forEach(p => p.score = 0); g.round = 0; }
 g.deck = [...cards]; g.discard = []; g.side = 'light'; g.direction = 1; g.dealer = dealer;
 g.turn = (dealer + 1) % g.players.length; g.round++; g.status = 'playing';
 g.drawn = undefined; g.winner = undefined; g.champion = undefined; g.roundPoints = undefined;
 g.unoDeadlines = {}; g.pending = undefined; g.reveal = undefined; g.choosingColor = undefined;
 g.placements = [];
 g.players.forEach(p => { p.hand = take(g, 7); p.uno = false; });
 g.log = ['Ván ' + g.round + ': ' + g.players[dealer].name + ' chia bài.'];
 const forbidden = g.mode === 'classic' ? 'wild_draw_four' : 'wild_draw_two';
 const rejected: Card[] = [];
 let top: Card;
 do { top = g.deck.pop()!; demand(top, 'Bộ bài không đủ để mở ván.'); if (face(g, top).value === forbidden) rejected.push(top); } while (face(g, top).value === forbidden);
 g.deck = shuffle([...g.deck, ...rejected]); g.discard = [top];
 const f = face(g, top);
 if (f.color === 'wild') { g.color = 'red'; g.choosingColor = g.players[g.turn].id; }
 else g.color = f.color;
 if (f.value === 'reverse') { g.direction = -1; g.turn = dealer; }
 else if (f.value === 'skip') next(g);
 else if (f.value === 'draw_two' || f.value === 'draw_one') { drawFor(g, g.players[g.turn].id, f.value === 'draw_two' ? 2 : 1); next(g); }
 else if (f.value === 'flip') flip(g);
}
function resolvePenalty(g: Game, challenge: boolean): void {
 const pending = g.pending!;
 const offender = g.players.find(p => p.id === pending.offender)!;
 const target = g.players.find(p => p.id === pending.target)!;
 if (challenge) g.reveal = { viewer: target.id, offender: offender.id, cards: pending.evidence };
 if (challenge && pending.guilty) {
  drawPenalty(g, offender.id, pending.kind, pending.color);
  g.log.push(target.name + ' thách thức đúng. ' + offender.name + ' nhận phạt; ' + target.name + ' tiếp tục lượt.');
 } else {
  drawPenalty(g, target.id, pending.kind, pending.color);
  if (challenge) drawFor(g, target.id, 2);
  g.log.push(challenge ? target.name + ' thách thức sai, nhận phạt thêm 2 lá và mất lượt.' : target.name + ' nhận phạt và mất lượt.');
  next(g);
 }
 g.pending = undefined;
 if (pending.finisher) finish(g, pending.finisher);
}
export const UNO_WINDOW_MS = 5000;
export function expireUno(g: Game, now = Date.now()): string[] {
 normalize(g);
 if (g.status !== 'playing') return [];
 const expired: string[] = [];
 for (const [id, deadline] of Object.entries(g.unoDeadlines)) {
  if (deadline > now) continue;
  const p = g.players.find(p => p.id === id);
  delete g.unoDeadlines[id];
  if (p && p.hand.length === 1 && !p.uno) {
   drawFor(g, id, 2); expired.push(id); g.log.push(p.name + ' không hô UNO trong 5 giây, rút 2 lá.');
   // A penalty can invalidate a previously drawn-card continuation.
   if (g.players[g.turn].id === id) g.drawn = undefined;
  }
 }
 g.log = g.log.slice(-20); return expired;
}
export function act(g: Game, id: string, a: Action, now = Date.now()): void {
 normalize(g);
 const p = g.players.find(p => p.id === id); demand(p, 'Bạn không ở trong phòng.');
 if (a.type === 'start') {
  demand(id === g.host, 'Chỉ chủ phòng được bắt đầu.'); demand(g.status !== 'playing', 'Ván đang diễn ra.');
  demand(g.players.length >= 2 && g.players.length <= g.maxPlayers && g.players.length <= 10, 'Cần từ 2 đến sức chứa tối đa của phòng (không quá 10 người).'); startRound(g); return;
 }
 demand(g.status === 'playing', 'Ván chưa bắt đầu hoặc đã kết thúc.');
 demand(!g.placements?.includes(id), 'Bạn đã có thứ hạng, hãy chờ ván tiếp theo.');
 if (a.type === 'catch') {
  const target = g.players.find(p => p.id === a.target);
  demand(target && target.id !== id && g.unoDeadlines[target.id] !== undefined && g.unoDeadlines[target.id] <= now, 'Người chơi có đủ 5 giây để hô UNO.');
  expireUno(g, now); return;
 }
 expireUno(g, now);
 if (a.type === 'uno') {
  demand(g.unoDeadlines[id] > now && p.hand.length === 1, 'Đã hết 5 giây hoặc bạn không còn 1 lá.'); p.uno = true; delete g.unoDeadlines[id]; g.log.push(p.name + ' hô UNO!'); return;
 }
 demand(g.players[g.turn].id === id, 'Chưa đến lượt bạn.');
 if (g.choosingColor) {
  demand(a.type === 'chooseColor' && g.choosingColor === id, 'Hãy chọn màu trước.');
  demand(a.color && activeColors(g).includes(a.color), 'Màu không thuộc mặt bài hiện tại.');
  g.color = a.color; g.choosingColor = undefined; g.reveal = undefined; return;
 }
 if (g.pending) {
  demand(g.pending.target === id && (a.type === 'accept' || a.type === 'challenge'), 'Hãy nhận phạt hoặc thách thức lá Wild.');
  g.reveal = undefined; resolvePenalty(g, a.type === 'challenge'); g.log = g.log.slice(-20); return;
 }
 if (a.type === 'draw') {
  demand(!g.drawn, 'Bạn đã rút bài, hãy đánh lá vừa rút hoặc bỏ lượt.');
  g.reveal = undefined;
  const [c] = take(g, 1); if (c) { p.hand.push(c); p.uno = false; delete g.unoDeadlines[id]; }
  if (c && playable(g, c)) g.drawn = c.id; else next(g);
  g.log.push(p.name + ' rút bài' + (c && playable(g, c) ? '.' : ' và chuyển lượt.'));
 } else if (a.type === 'pass') {
  demand(g.drawn, 'Bạn cần rút bài trước.'); g.reveal = undefined; next(g); g.log.push(p.name + ' bỏ lượt.');
 } else if (a.type === 'play') {
  const i = p.hand.findIndex(c => c.id === a.cardId); demand(i >= 0, 'Lá bài không thuộc về bạn.'); const c = p.hand[i], f = face(g, c);
  demand(!g.drawn || g.drawn === c.id, 'Chỉ được đánh lá vừa rút.'); demand(playable(g, c), 'Lá bài không hợp lệ.');
  demand(p.hand.length !== 1 || !g.unoDeadlines[id] || a.uno, 'Hãy hô UNO trước khi đánh lá cuối.');
  if (f.color === 'wild') demand(a.color && activeColors(g).includes(a.color), 'Hãy chọn màu thuộc mặt bài hiện tại.');
  const oldColor = g.color;
  const guilty = p.hand.some(other => face(g, other).color === oldColor);
  delete g.unoDeadlines[id]; g.reveal = undefined;
  p.hand.splice(i, 1); g.discard.push(c); g.drawn = undefined;
  g.color = f.color === 'wild' ? a.color! : f.color;
  p.uno = p.hand.length === 1 && !!a.uno;
  if (p.hand.length === 1 && !p.uno) g.unoDeadlines[id] = now + UNO_WINDOW_MS;
  g.log.push(p.name + ' đánh ' + f.value.replace('number_', '') + (p.uno ? ' · UNO!' : '') + '.');
  if (['wild_draw_four', 'wild_draw_two', 'wild_draw_color'].includes(f.value)) {
   next(g);
   g.pending = { offender: id, target: g.players[g.turn].id, kind: f.value as PendingPenalty['kind'], color: g.color, previousColor: oldColor,
    guilty, evidence: p.hand.map(c => publicCard(g, c)), finisher: p.hand.length ? undefined : id };
  } else {
   let steps = 1;
   if (f.value === 'reverse') { g.direction *= -1; if (g.players.length - (g.placements?.length ?? 0) === 2) steps = 2; }
   if (f.value === 'skip') steps = 2;
   if (f.value === 'skip_everyone') steps = 0;
   const penalty = f.value === 'draw_two' ? 2 : f.value === 'draw_one' ? 1 : f.value === 'draw_five' ? 5 : 0;
   if (penalty) { drawFor(g, g.players[index(g, g.turn)].id, penalty); steps = 2; }
   next(g, steps);
   if (f.value === 'flip') flip(g);
   if (!p.hand.length) finish(g, id);
  }
 } else throw new Error('Thao tác không hợp lệ trong trạng thái hiện tại.');
 g.log = g.log.slice(-20);
}
export function view(raw: Game, id: string, code: string, version: number): View {
 const g = normalize(raw);
 const { deck, discard, players, pending, reveal, drawn, botNextAt, ...safe } = g;
 const opposite = g.side === 'light' ? 'dark' : 'light';
 return { ...safe, code, version, serverNow: Date.now(), me: id, remaining: deck.length,
  drawn: players[g.turn]?.id === id ? drawn : undefined,
  top: discard.length ? publicCard(g, discard.at(-1)!) : undefined,
  drawBack: g.mode === 'flip' ? deck.at(-1)?.[opposite]?.image : undefined,
  hand: players.find(p => p.id === id)?.hand.map(c => publicCard(g, c)) ?? [],
  players: players.map(p => ({ id: p.id, name: p.name, count: p.hand.length, uno: p.uno, score: p.score, bot: !!p.bot,
   backs: g.mode === 'flip' && p.id !== id ? p.hand.map(c => c[opposite]!.image) : undefined })),
  pending: pending ? { offender: pending.offender, target: pending.target, kind: pending.kind, color: pending.color, previousColor: pending.previousColor } : undefined,
  reveal: reveal?.viewer === id ? { offender: reveal.offender, cards: reveal.cards } : undefined };
}

