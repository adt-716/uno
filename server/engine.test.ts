import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { act, cardPoints, deck, empty, expireUno, face, playable, startRound, view } from './engine';
import type { Card, Color, Face, Game, Mode } from '../shared/types';

let serial = 0;
const f = (color: Face['color'], value: string): Face => ({ image: color + '/' + value + '.png', color, value });
const card = (color: Face['color'], value: string): Card => ({ id: 'test-' + serial++, ...f(color, value) });
const dual = (lc: Face['color'], lv: string, dc: Face['color'] = 'pink', dv = lv): Card => {
 const light = f(lc, lv), dark = f(dc, dv);
 return { id: 'test-' + serial++, ...light, light, dark };
};
function fixture(mode: Mode = 'classic', count = 3): Game {
 const g = empty('a', 'An', mode);
 // Legacy saved rounds retain first-out scoring until the next startRound.
 g.placements = undefined;
 g.players = Array.from({ length: count }, (_, i) => ({
  id: String.fromCharCode(97 + i), name: 'Player ' + i, hand: [mode === 'classic' ? card('blue', 'number_3') : dual('blue', 'number_3', 'teal', 'number_3')], uno: false, score: 0,
 }));
 g.status = 'playing'; g.round = 1; g.turn = 0; g.color = 'red';
 g.deck = Array.from({ length: 65 }, () => mode === 'classic' ? card('red', 'number_8') : dual('red', 'number_8', 'pink', 'number_8'));
 g.discard = [mode === 'classic' ? card('red', 'number_5') : dual('red', 'number_5', 'pink', 'number_5')];
 return g;
}
function play(g: Game, value: string, extra: Partial<Parameters<typeof act>[2]> = {}) {
 const p = g.players[g.turn], c = p.hand.find(c => face(g, c).value === value)!;
 assert.ok(c, value);
 act(g, p.id, { type: 'play', cardId: c.id, ...extra });
}
function total(g: Game): Card[] { return [...g.deck, ...g.discard, ...g.players.flatMap(p => p.hand)]; }
function opening(mode: Mode, value: string, count = 3): Game {
 const g = fixture(mode, count);
 const cards = deck(mode), i = cards.findIndex(c => face(g, c).value === value);
 const [top] = cards.splice(i, 1), hands = cards.splice(-count * 7);
 startRound(g, [...cards, top, ...hands], 0);
 return g;
}

test('Classic and Flip inventory counts, unique IDs and every image exists', () => {
 for (const mode of ['classic', 'flip'] as const) {
  const cards = deck(mode); assert.equal(cards.length, mode === 'classic' ? 108 : 112);
  assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  for (const c of cards) for (const image of [c.image, c.light?.image, c.dark?.image].filter(Boolean)) assert.ok(existsSync('img/' + image));
 }
 const cards = deck('flip');
 for (const side of ['light', 'dark'] as const) {
  const counts = new Map<string, number>();
  for (const c of cards) { const key = c[side]!.color + ':' + c[side]!.value; counts.set(key, (counts.get(key) ?? 0) + 1); }
  assert.equal(counts.size, 54);
  for (const [key, count] of counts) assert.equal(count, key.startsWith('wild:') ? 4 : 2);
 }
});
test('deal conserves entire deck and starts left of dealer on number', () => {
 for (const mode of ['classic', 'flip'] as const) {
  const g = opening(mode, 'number_5');
  assert.equal(g.turn, 1); assert.equal(g.dealer, 0);
  for (const p of g.players) assert.equal(p.hand.length, 7);
  assert.equal(total(g).length, deck(mode).length);
  assert.equal(new Set(total(g).map(c => c.id)).size, deck(mode).length);
 }
});
test('opening reverse, skip and fixed draw penalties', () => {
 for (const mode of ['classic', 'flip'] as const) {
  const reverse = opening(mode, 'reverse'); assert.equal(reverse.direction, -1); assert.equal(reverse.turn, 0);
  assert.equal(opening(mode, 'skip').turn, 2);
  const g = opening(mode, mode === 'classic' ? 'draw_two' : 'draw_one');
  assert.equal(g.players[1].hand.length, mode === 'classic' ? 9 : 8); assert.equal(g.turn, 2);
 }
});
test('opening Wild requires first player to choose valid color', () => {
 const g = opening('classic', 'wild'); assert.equal(g.choosingColor, 'b');
 assert.throws(() => act(g, 'b', { type: 'draw' }), /chọn màu/);
 assert.throws(() => act(g, 'b', { type: 'chooseColor', color: 'pink' }), /Màu/);
 act(g, 'b', { type: 'chooseColor', color: 'green' }); assert.equal(g.color, 'green'); assert.equal(g.turn, 1);
});
test('opening Wild penalties are returned without losing cards', () => {
 for (const mode of ['classic', 'flip'] as const) {
  const g = fixture(mode), cards = deck(mode), v = mode === 'classic' ? 'wild_draw_four' : 'wild_draw_two';
  const [bad] = cards.splice(cards.findIndex(c => face(g, c).value === v), 1);
  const [safe] = cards.splice(cards.findIndex(c => face(g, c).value === 'number_5'), 1);
  const hands = cards.splice(-21);
  startRound(g, [...cards, safe, bad, ...hands], 0);
  assert.equal(face(g, g.discard.at(-1)!).value, 'number_5');
  assert.equal(total(g).length, deck(mode).length); assert.ok(g.deck.some(c => c.id === bad.id));
 }
});
test('rejects wrong turn, card not owned and wrong color', () => {
 const g = fixture();
 assert.throws(() => act(g, 'b', { type: 'draw' }), /lượt/);
 assert.throws(() => act(g, 'a', { type: 'play', cardId: 'unknown' }), /thuộc/);
 assert.throws(() => play(g, 'number_3'), /không hợp lệ/);
});
test('playable draw allows only newly drawn card; pass transfers turn', () => {
 const g = fixture(); g.players[0].hand.push(card('red', 'number_2'));
 act(g, 'a', { type: 'draw' }); assert.ok(g.drawn);
 assert.equal(view(g, 'b', 'ABC234', 0).drawn, undefined);
 assert.throws(() => act(g, 'a', { type: 'draw' }), /đã rút/);
 assert.throws(() => play(g, 'number_2'), /vừa rút/);
 act(g, 'a', { type: 'pass' }); assert.equal(g.turn, 1);
});
test('unplayable draw automatically passes; voluntary draw is allowed', () => {
 const g = fixture(); g.players[0].hand.push(card('red', 'number_2')); g.deck = [card('yellow', 'number_8')];
 act(g, 'a', { type: 'draw' }); assert.equal(g.turn, 1); assert.equal(g.drawn, undefined);
});
test('Reverse with two players retains turn; with three reverses direction', () => {
 for (const n of [2, 3]) {
  const g = fixture('classic', n); g.players[0].hand.push(card('red', 'reverse'));
  play(g, 'reverse'); assert.equal(g.direction, -1); assert.equal(g.turn, n === 2 ? 0 : 2);
 }
});
test('fixed penalties draw exact amount and skip victim on both Flip sides', () => {
 for (const [mode, side, value, n] of [
  ['classic', 'light', 'draw_two', 2], ['flip', 'light', 'draw_one', 1], ['flip', 'dark', 'draw_five', 5],
 ] as const) {
  const g = fixture(mode); g.side = side; g.color = side === 'dark' ? 'pink' : 'red';
  g.players[0].hand.push(mode === 'classic' ? card('red', value) : dual('red', value, 'pink', value));
  const count = g.players[1].hand.length; play(g, value);
  assert.equal(g.players[1].hand.length, count + n); assert.equal(g.turn, 2);
 }
});
test('UNO five-second window survives next player action and JSON reload', () => {
 const g = fixture(); g.players[0].hand.push(card('red', 'number_2'));
 const before = Date.now(); play(g, 'number_2'); const deadline = g.unoDeadlines.a;
 assert.ok(deadline >= before + 5000 && deadline <= Date.now() + 5000);
 act(g, 'b', { type: 'draw' }); assert.equal(g.unoDeadlines.a, deadline);
 const restored = JSON.parse(JSON.stringify(g)) as Game;
 act(restored, 'a', { type: 'uno' }, deadline - 1); assert.equal(restored.players[0].uno, true);
 assert.equal(restored.unoDeadlines.a, undefined);
});
test('UNO timeout draws two once at exactly five seconds; opponents cannot catch early', () => {
 const g = fixture(); g.players[0].hand.push(card('red', 'number_2')); play(g, 'number_2');
 const deadline = g.unoDeadlines.a;
 assert.throws(() => act(g, 'c', { type: 'catch', target: 'a' }, deadline - 1), /5 giây/);
 assert.deepEqual(expireUno(g, deadline - 1), []); assert.equal(g.players[0].hand.length, 1);
 assert.deepEqual(expireUno(g, deadline), ['a']); assert.equal(g.players[0].hand.length, 3);
 assert.deepEqual(expireUno(g, deadline + 100), []); assert.equal(g.players[0].hand.length, 3);
 assert.throws(() => act(g, 'a', { type: 'uno' }, deadline + 100), /hết 5 giây/);
});
test('UNO with play cannot be caught', () => {
 const g = fixture(); g.players[0].hand.push(card('red', 'number_2'));
 play(g, 'number_2', { uno: true }); assert.equal(g.players[0].uno, true); assert.deepEqual(g.unoDeadlines, {});
});
test('empty draw cannot cancel an active UNO deadline or an existing UNO call', () => {
 for (const called of [false, true]) {
  const g = fixture(); g.deck = []; g.players[0].uno = called;
  if (!called) g.unoDeadlines.a = 6000;
  act(g, 'a', { type: 'draw' }, 2000);
  assert.equal(g.players[0].hand.length, 1); assert.equal(g.turn, 1);
  assert.equal(g.players[0].uno, called);
  assert.equal(g.unoDeadlines.a, called ? undefined : 6000);
  if (!called) { act(g, 'a', { type: 'uno' }, 3000); assert.equal(g.players[0].uno, true); }
 }
});
test('depleted Wild penalties preserve UNO status when no card was actually drawn', () => {
 for (const kind of ['wild_draw_four', 'wild_draw_two', 'wild_draw_color'] as const) {
  for (const called of [false, true]) {
   const g = fixture(kind === 'wild_draw_four' ? 'classic' : 'flip');
   g.deck = []; g.players[1].uno = called;
   if (!called) g.unoDeadlines.b = 6000;
   g.turn = 1;
   g.pending = { offender: 'a', target: 'b', kind, color: 'red', previousColor: 'red', guilty: false, evidence: [] };
   act(g, 'b', { type: 'accept' }, 2000);
   assert.equal(g.players[1].hand.length, 1); assert.equal(g.turn, 2);
   assert.equal(g.players[1].uno, called);
   assert.equal(g.unoDeadlines.b, called ? undefined : 6000);
  }
 }
});
test('multiple UNO deadlines are independent and cleared when drawing a penalty', () => {
 const g = fixture(); g.unoDeadlines = { a: 6000, b: 8000 };
 assert.deepEqual(expireUno(g, 6000), ['a']); assert.equal(g.unoDeadlines.b, 8000);
 assert.equal(g.players[0].hand.length, 3); assert.equal(g.players[1].hand.length, 1);
 act(g, 'b', { type: 'uno' }, 7999); assert.equal(g.players[1].uno, true);
 assert.deepEqual(expireUno(g, 8000), []);
});
test('last card cannot be played before UNO call, but can be played with same-action call', () => {
 const g = fixture('classic', 2); g.players[0].hand = [card('red', 'number_2')];
 g.unoDeadlines.a = Date.now() + 5000;
 assert.throws(() => play(g, 'number_2'), /hô UNO/);
 play(g, 'number_2', { uno: true }); assert.equal(g.status, 'finished');
});
test('Classic +4 bluff is challengeable, hidden before challenge and shown only to challenger', () => {
 const g = fixture(); g.players[0].hand = [card('wild', 'wild_draw_four'), card('red', 'number_2')];
 play(g, 'wild_draw_four', { color: 'blue' }); assert.equal(g.pending?.guilty, true);
 for (const p of g.players) { const v = view(g, p.id, 'ABC234', 1); assert.equal('guilty' in v.pending!, false); assert.equal('evidence' in v.pending!, false); }
 assert.throws(() => act(g, 'b', { type: 'draw' }), /nhận phạt/);
 act(g, 'b', { type: 'challenge' }); assert.equal(g.players[0].hand.length, 5); assert.equal(g.turn, 1);
 assert.equal(view(g, 'b', 'ABC234', 2).reveal?.cards.length, 1);
 assert.equal(view(g, 'c', 'ABC234', 2).reveal, undefined); assert.equal(view(g, 'a', 'ABC234', 2).reveal, undefined);
});
test('legal +4 accepts four or failed challenge six, skipping recipient', () => {
 for (const type of ['accept', 'challenge'] as const) {
  const g = fixture(); g.players[0].hand.push(card('wild', 'wild_draw_four'));
  play(g, 'wild_draw_four', { color: 'green' }); assert.equal(g.pending?.guilty, false);
  act(g, 'b', { type }); assert.equal(g.players[1].hand.length, type === 'accept' ? 5 : 7); assert.equal(g.turn, 2);
 }
});
test('matching number of different color does not make Wild penalty illegal', () => {
 const g = fixture(); g.players[0].hand = [card('wild', 'wild_draw_four'), card('green', 'number_5')];
 play(g, 'wild_draw_four', { color: 'blue' }); assert.equal(g.pending?.guilty, false);
});
test('Flip Wild +2 successful and unsuccessful challenges', () => {
 for (const guilty of [true, false]) {
  const g = fixture('flip');
  g.players[0].hand = [dual('wild', 'wild_draw_two'), dual(guilty ? 'red' : 'blue', 'number_2')];
  play(g, 'wild_draw_two', { color: 'green' }); act(g, 'b', { type: 'challenge' });
  assert.equal(g.players[guilty ? 0 : 1].hand.length, guilty ? 3 : 5); assert.equal(g.turn, guilty ? 1 : 2);
 }
});
test('Flip reverses piles, changes every active face and never triggers exposed action', () => {
 const g = fixture('flip');
 const bottom = dual('red', 'number_1', 'purple', 'draw_five'), oldTop = g.discard[0];
 g.discard.unshift(bottom);
 const nextDraw = g.deck[0];
 g.players[0].hand.push(dual('red', 'flip', 'orange', 'number_4'));
 const played = g.players[0].hand.at(-1)!;
 play(g, 'flip');
 assert.equal(g.side, 'dark'); assert.equal(g.discard.at(-1)?.id, bottom.id);
 assert.equal(g.discard[0].id, played.id); assert.equal(g.discard[1].id, oldTop.id);
 assert.equal(g.deck.at(-1)?.id, nextDraw.id); assert.equal(g.color, 'purple'); assert.equal(g.turn, 1);
 assert.equal(g.players[1].hand.length, 1); assert.equal(view(g, 'b', 'ABC234', 0).hand[0].color, 'teal');
});
test('dark Flip returns to light with correct reversed piles', () => {
 const g = fixture('flip'); g.side = 'dark'; g.color = 'pink';
 g.players[0].hand.push(dual('yellow', 'number_3', 'pink', 'flip'));
 play(g, 'flip'); assert.equal(g.side, 'light'); assert.equal(g.color, 'red');
});
test('Flip exposed Wild asks next player for active-side color; no automatic penalty', () => {
 const g = fixture('flip'); g.discard = [dual('red', 'number_5', 'wild', 'wild_draw_color')];
 g.players[0].hand.push(dual('red', 'flip')); play(g, 'flip');
 assert.equal(g.choosingColor, 'b'); assert.equal(g.pending, undefined);
 assert.throws(() => act(g, 'b', { type: 'chooseColor', color: 'red' }), /Màu/);
 act(g, 'b', { type: 'chooseColor', color: 'orange' }); assert.equal(g.color, 'orange'); assert.equal(g.turn, 1);
});
test('opening Flip switches sides and preserves inventory', () => {
 const g = opening('flip', 'flip'); assert.equal(g.side, 'dark'); assert.equal(total(g).length, 112);
});
test('dark Skip Everyone returns to same player', () => {
 const g = fixture('flip', 4); g.side = 'dark'; g.color = 'pink'; g.players[0].hand.push(dual('red', 'skip', 'pink', 'skip_everyone'));
 play(g, 'skip_everyone'); assert.equal(g.turn, 0);
});
test('Wild color choice rejects colors from the other side', () => {
 const g = fixture('flip'); g.side = 'dark'; g.color = 'pink'; g.players[0].hand.push(dual('wild', 'wild', 'wild', 'wild'));
 assert.throws(() => play(g, 'wild', { color: 'red' }), /chọn màu/);
 play(g, 'wild', { color: 'teal' }); assert.equal(g.color, 'teal');
});
function colorPenalty(guilty: boolean) {
 const g = fixture('flip'); g.side = 'dark'; g.color = 'pink';
 g.players[0].hand = [dual('wild', 'wild', 'wild', 'wild_draw_color'), dual('red', 'number_2', guilty ? 'pink' : 'teal', 'number_2')];
 // pop order: wild, teal, orange (the matching orange must also be retained), then two extras.
 g.deck = [dual('red', 'number_9', 'pink', 'number_9'), dual('red', 'number_8', 'pink', 'number_8'), dual('red', 'number_7', 'orange', 'number_7'), dual('red', 'number_6', 'teal', 'number_6'), dual('wild', 'wild', 'wild', 'wild')];
 play(g, 'wild_draw_color', { color: 'orange' }); return g;
}
test('Wild Draw Color includes matching card and ignores Wild as match', () => {
 const g = colorPenalty(false); act(g, 'b', { type: 'accept' });
 assert.equal(g.players[1].hand.length, 4); assert.equal(face(g, g.players[1].hand.at(-1)!).color, 'orange'); assert.equal(g.turn, 2);
});
test('Wild Draw Color challenge success transfers draw; failure adds two', () => {
 for (const guilty of [true, false]) {
  const g = colorPenalty(guilty); act(g, 'b', { type: 'challenge' });
  assert.equal(g.players[guilty ? 0 : 1].hand.length, guilty ? 4 : 6); assert.equal(g.turn, guilty ? 1 : 2);
 }
});
test('Wild Draw Color terminates safely on depleted piles without a matching color', () => {
 const g = colorPenalty(false); g.deck = [dual('blue', 'number_1', 'teal', 'number_1')]; g.discard = [g.discard.at(-1)!];
 act(g, 'b', { type: 'accept' }); assert.equal(g.players[1].hand.length, 2); assert.equal(g.turn, 2);
});
test('last fixed penalty is included before Classic scoring, then 500-point champion', () => {
 const g = fixture('classic', 2); g.players[0].score = 480; g.players[0].hand = [card('red', 'draw_two')];
 g.players[1].hand = [card('blue', 'number_3')]; g.deck = [card('yellow', 'number_7'), card('green', 'number_9')];
 play(g, 'draw_two'); assert.equal(g.status, 'finished'); assert.equal(g.players[1].hand.length, 3);
 assert.equal(g.roundPoints, 19); assert.equal(g.players[0].score, 499); assert.equal(g.champion, undefined);
 const h = fixture('classic', 2); h.players[0].score = 499; h.players[0].hand = [card('red', 'number_3')];
 play(h, 'number_3'); assert.equal(h.champion, 'a');
});
test('last Wild penalty waits for resolution before scoring, including challenge failure', () => {
 for (const type of ['accept', 'challenge'] as const) {
  const g = fixture('classic', 2); g.players[0].hand = [card('wild', 'wild_draw_four')];
  play(g, 'wild_draw_four', { color: 'green' }); assert.equal(g.status, 'playing'); assert.equal(g.winner, undefined);
  act(g, 'b', { type }); assert.equal(g.status, 'finished'); assert.equal(g.winner, 'a');
  assert.equal(g.players[1].hand.length, type === 'accept' ? 5 : 7); assert.ok(g.roundPoints! > 0);
 }
});
test('Flip point values and last Flip scores newly active side', () => {
 const g = fixture('flip', 2);
 const vals = { draw_one: 10, draw_five: 20, reverse: 20, skip: 20, skip_everyone: 30, flip: 20, wild: 40, wild_draw_two: 50, wild_draw_color: 60 };
 for (const [v, n] of Object.entries(vals)) assert.equal(cardPoints(g, dual('red', v)), n);
 g.players[0].hand = [dual('red', 'flip')]; g.players[1].hand = [dual('blue', 'number_2', 'wild', 'wild_draw_color')];
 play(g, 'flip'); assert.equal(g.side, 'dark'); assert.equal(g.roundPoints, 60);
});
test('last Flip Wild Draw Color finishes after chosen-color penalty', () => {
 const g = colorPenalty(false); g.players[0].hand = []; g.pending!.finisher = 'a';
 act(g, 'b', { type: 'accept' }); assert.equal(g.status, 'finished'); assert.equal(g.winner, 'a'); assert.ok(Number.isFinite(g.roundPoints));
});
test('new rounds retain scores; new match resets only after champion', () => {
 const g = fixture(); g.players[0].score = 120;
 startRound(g); assert.equal(g.players[0].score, 120); assert.equal(g.round, 2);
 g.champion = 'a'; startRound(g); assert.equal(g.players[0].score, 0); assert.equal(g.round, 1);
});
test('private projection never sends opponent active faces, full deck or reverse side of own hand', () => {
 const g = fixture('flip'); const v = view(g, 'a', 'ABC234', 1);
 assert.equal('deck' in v, false); assert.equal('discard' in v, false);
 assert.equal('light' in v.hand[0], false); assert.equal('dark' in v.hand[0], false);
 assert.equal('hand' in v.players[1], false); assert.deepEqual(v.players[1].backs, [g.players[1].hand[0].dark!.image]);
 assert.equal(v.players[0].backs, undefined); assert.equal(v.drawBack, g.deck.at(-1)!.dark!.image);
});
test('discard reshuffle keeps current top', () => {
 const g = fixture(); const top = g.discard[0], recycled = card('red', 'number_7');
 g.deck = []; g.discard.unshift(recycled); act(g, 'a', { type: 'draw' });
 assert.equal(g.discard.length, 1); assert.equal(g.discard[0].id, top.id); assert.equal(g.drawn, recycled.id);
});
test('old saved Classic room normalizes without losing cards or throwing', () => {
 const g = fixture(); delete (g as any).mode; delete (g as any).side; delete (g as any).round; delete (g.players[0] as any).score;
 const before = total(g).map(c => c.id); const v = view(JSON.parse(JSON.stringify(g)), 'a', 'ABC234', 0);
 assert.equal(v.mode, 'classic'); assert.equal(v.players[0].score, 0);
 act(g, 'a', { type: 'draw' }); assert.deepEqual(total(g).map(c => c.id).sort(), before.sort());
});
test('complete Classic and Flip games preserve all physical cards through JSON persistence', () => {
 for (const mode of ['classic', 'flip'] as const) {
  let g = fixture(mode, 4); startRound(g);
  let steps = 0;
  while (g.status === 'playing' && steps++ < 15000) {
   const id = g.players[g.turn].id;
   if (g.choosingColor) act(g, id, { type: 'chooseColor', color: g.side === 'dark' ? 'pink' : 'red' });
   else if (g.pending) act(g, id, { type: steps % 3 === 0 ? 'challenge' : 'accept' });
   else {
    const c = g.players[g.turn].hand.find(c => (!g.drawn || g.drawn === c.id) && playable(g, c));
    if (c) act(g, id, { type: 'play', cardId: c.id, color: g.side === 'dark' ? 'pink' : 'red', uno: true });
    else act(g, id, { type: g.drawn ? 'pass' : 'draw' });
   }
   g = JSON.parse(JSON.stringify(g));
   assert.equal(total(g).length, deck(mode).length);
   assert.equal(new Set(total(g).map(c => c.id)).size, deck(mode).length);
   assert.ok(g.players.every(p => Number.isFinite(p.score)));
  }
  assert.equal(g.status, 'finished', 'game terminates: ' + mode); assert.ok(Number.isFinite(g.roundPoints));
 }
});


test('ranked round continues in both modes, skips finishers and assigns every place', () => {
 for (const mode of ['classic', 'flip'] as const) {
  const g = fixture(mode, 4); g.placements = [];
  const make = (value: string) => mode === 'classic' ? card('red', value) : dual('red', value);
  g.players.forEach(p => { p.hand = [make('number_5')]; });
  play(g, 'number_5');
  assert.deepEqual(g.placements, ['a']); assert.equal(g.status, 'playing'); assert.equal(g.turn, 1);
  const points = g.players[0].score;
  assert.throws(() => act(g, 'a', { type: 'draw' }), /thứ hạng/);
  play(g, 'number_5'); assert.deepEqual(g.placements, ['a', 'b']); assert.equal(g.turn, 2);
  play(g, 'number_5');
  assert.equal(g.status, 'finished'); assert.deepEqual(g.placements, ['a', 'b', 'c', 'd']);
  assert.equal(g.winner, 'a'); assert.equal(g.players[0].score, points);
  startRound(g); assert.deepEqual(g.placements, []); assert.equal(g.players[0].score, points);
 }
});
test('ranked reverse uses remaining players, not total occupied seats', () => {
 const g = fixture('classic', 4); g.placements = ['a', 'b'];
 g.players[0].hand = []; g.players[1].hand = []; g.turn = 2;
 g.players[2].hand.push(card('red', 'reverse'));
 play(g, 'reverse', { uno: true }); assert.equal(g.turn, 2); assert.equal(g.direction, -1);
 g.players[2].hand.push(card('red', 'draw_two'));
 const before = g.players[3].hand.length;
 play(g, 'draw_two', { uno: true }); assert.equal(g.players[3].hand.length, before + 2); assert.equal(g.turn, 2);
});
test('ranked last Wild waits for penalty before awarding place and skips prior finishers', () => {
 const g = fixture('classic', 4); g.placements = ['b']; g.players[1].hand = [];
 g.players[0].hand = [card('wild', 'wild_draw_four')];
 play(g, 'wild_draw_four', { color: 'green' });
 assert.deepEqual(g.placements, ['b']); assert.equal(g.pending?.target, 'c');
 act(g, 'c', { type: 'accept' });
 assert.deepEqual(g.placements, ['b', 'a']); assert.equal(g.turn, 3); assert.equal(g.status, 'playing');
});
test('ranked last Skip Everyone and Flip do not leave the turn on a finisher', () => {
 for (const value of ['skip_everyone', 'flip']) {
  const g = fixture('flip', 4); g.placements = []; g.side = 'dark'; g.color = 'pink';
  g.players[0].hand = [dual('red', 'number_1', 'pink', value)];
  play(g, value); assert.deepEqual(g.placements, ['a']); assert.equal(g.turn, 1);
  assert.equal(g.status, 'playing');
 }
});
