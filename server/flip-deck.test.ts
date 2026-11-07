import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import policy from '../img/flip_pairing_policy.json';
import { act, cardPoints, deck, empty, face, view } from './engine';
import { colors, darkColors, type Card, type Color, type Game } from '../shared/types';

const isNumber = (c: Card, side: 'light' | 'dark') => c[side]!.value.startsWith('number_');
test('balanced Flip deck matches its versioned checksum and has no duplicate physical pairs', () => {
 const bytes = readFileSync(new URL('../img/flip_deck_112.json', import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'), policy.deckSha256);
 assert.equal(policy.physicalMattelPairing, false);
 assert.equal(new Set(deck('flip').map(c => c.light!.image + '|' + c.dark!.image)).size, 112);
});
test('each light color has six of each dark color plus one Wild and one Wild Draw Color', () => {
 const cards = deck('flip');
 for (const lc of colors) {
  const row = cards.filter(c => c.light!.color === lc);
  assert.equal(row.length, 26);
  for (const dc of darkColors) {
   const cell = row.filter(c => c.dark!.color === dc);
   assert.equal(cell.length, 6);
   assert.equal(cell.filter(c => isNumber(c, 'dark')).length, 4);
  }
  assert.equal(row.filter(c => c.dark!.value === 'wild').length, 1);
  assert.equal(row.filter(c => c.dark!.value === 'wild_draw_color').length, 1);
  assert.equal(row.filter(c => !isNumber(c, 'light') && !isNumber(c, 'dark')).length, 3);
 }
});
test('identical light faces have distinct dark colors; no same-number or Flip/Flip pairs', () => {
 const groups = new Map<string, Card[]>();
 for (const c of deck('flip')) {
  const group = groups.get(c.light!.image) ?? []; group.push(c); groups.set(c.light!.image, group);
  if (isNumber(c, 'light') && isNumber(c, 'dark')) assert.notEqual(c.light!.value, c.dark!.value);
  assert.ok(c.light!.value !== 'flip' || c.dark!.value !== 'flip');
  if (c.light!.color === 'wild') assert.ok(isNumber(c, 'dark'));
  if (c.dark!.color === 'wild') assert.ok(isNumber(c, 'light'));
 }
 for (const group of groups.values()) assert.equal(new Set(group.map(c => c.dark!.color)).size, group.length);
});

function actualColorPenalty(chosen: Color, lightColor: Color, guilty = false): Game {
 const g = empty('a', 'An', 'flip'); g.deck = deck('flip');
 const pick = (predicate: (c: Card) => boolean): Card => {
  const i = g.deck.findIndex(predicate); assert.ok(i >= 0); return g.deck.splice(i, 1)[0];
 };
 const wdc = pick(c => c.dark!.value === 'wild_draw_color' && c.light!.color === lightColor);
 const other = pick(c => c.dark!.color === (guilty ? 'pink' : 'teal') && isNumber(c, 'dark'));
 g.players[0].hand = [wdc, other];
 g.players.push({ id: 'b', name: 'Bình', hand: [pick(c => isNumber(c, 'dark'))], uno: false, score: 0 });
 g.players.push({ id: 'c', name: 'Chi', hand: [pick(c => isNumber(c, 'dark'))], uno: false, score: 0 });
 g.discard = [pick(c => c.dark!.color === 'pink' && isNumber(c, 'dark'))];
 const hit = pick(c => c.dark!.color === chosen && isNumber(c, 'dark'));
 const miss = pick(c => c.dark!.color !== chosen && c.dark!.color !== 'wild');
 const wild = pick(c => c.dark!.value === 'wild');
 g.deck.push(hit, miss, wild); // pop order: Wild, wrong color, chosen color.
 g.side = 'dark'; g.color = 'pink'; g.status = 'playing'; g.turn = 0; g.round = 1;
 return g;
}
test('all four real dark Wild Draw Color cards draw through a Wild to every chosen color', () => {
 for (let i = 0; i < 4; i++) {
  const color = darkColors[i], g = actualColorPenalty(color, colors[i]);
  const wdc = g.players[0].hand[0];
  assert.equal(face(g, wdc).value, 'wild_draw_color'); assert.equal(cardPoints(g, wdc), 60);
  act(g, 'a', { type: 'play', cardId: wdc.id, color, uno: true });
  assert.equal(g.pending?.kind, 'wild_draw_color'); assert.equal(view(g, 'a', 'ABC234', 1).top?.value, 'wild_draw_color');
  act(g, 'b', { type: 'accept' });
  assert.equal(g.players[1].hand.length, 4);
  assert.equal(face(g, g.players[1].hand.at(-1)!).color, color); assert.equal(g.turn, 2);
  assert.equal([...g.deck, ...g.discard, ...g.players.flatMap(p => p.hand)].length, 112);
 }
});
test('real Wild Draw Color challenges transfer penalty or add two cards for all dark colors', () => {
 for (let i = 0; i < 4; i++) for (const guilty of [false, true]) {
  const g = actualColorPenalty(darkColors[i], colors[i], guilty);
  act(g, 'a', { type: 'play', cardId: g.players[0].hand[0].id, color: darkColors[i], uno: true });
  act(g, 'b', { type: 'challenge' });
  assert.equal(g.players[guilty ? 0 : 1].hand.length, guilty ? 4 : 6);
  assert.equal(g.turn, guilty ? 1 : 2);
 }
});
test('dark Wild Draw Color is a normal number on its light side, not a hidden penalty', () => {
 const g = actualColorPenalty('orange', 'red'); g.side = 'light';
 const c = g.players[0].hand[0]; g.color = c.light!.color as Color;
 assert.match(face(g, c).value, /^number_/);
 act(g, 'a', { type: 'play', cardId: c.id, uno: true });
 assert.equal(g.pending, undefined); assert.equal(g.players[1].hand.length, 1);
});
