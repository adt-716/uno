import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botDecision, soloGame } from './bots';
import { act, deck, empty, startRound, view } from './engine';
import type { Game, Mode, View } from '../shared/types';

function projection(mode: Mode = 'classic'): View {
 const g = empty('a', 'An', mode);
 g.players.push({ id: 'b', name: 'Bình', hand: [], uno: false, score: 0, bot: true });
 startRound(g); g.turn = 1; g.choosingColor = undefined;
 return view(g, 'b', 'ABC234', 1);
}
test('solo creates exactly one human and three distinct bot identities', () => {
 const g = soloGame('a', 'An', 'flip');
 assert.equal(g.kind, 'solo'); assert.equal(g.maxPlayers, 4); assert.equal(g.players.length, 4);
 assert.equal(g.players.filter(p => p.bot).length, 3); assert.equal(new Set(g.players.map(p => p.id)).size, 4);
 assert.equal(g.players[0].bot, undefined);
});
test('bot waits for turn, handles pending and chooses dark color using only own hand', () => {
 const v = projection('flip'); v.side = 'dark'; v.color = 'pink';
 v.hand = [{ id: '1', image: 'test', color: 'purple', value: 'number_3' }, { id: '2', image: 'test', color: 'purple', value: 'number_8' }];
 v.choosingColor = v.me; assert.deepEqual(botDecision(v), { type: 'chooseColor', color: 'purple' });
 v.choosingColor = undefined; v.pending = { offender: 'a', target: 'b', kind: 'wild_draw_color', color: 'orange', previousColor: 'pink' };
 assert.deepEqual(botDecision(v), { type: 'accept' }); v.turn = 0; assert.equal(botDecision(v), null);
});
test('bot avoids illegal Wild penalty and calls UNO with its valid play', () => {
 const v = projection(); v.color = 'red'; v.top = { id: 'top', image: 'test', color: 'red', value: 'number_1' };
 v.hand = [{ id: 'wild', image: 'test', color: 'wild', value: 'wild_draw_four' }, { id: 'red', image: 'test', color: 'red', value: 'number_3' }];
 const a = botDecision(v); assert.equal(a?.cardId, 'red'); assert.equal(a?.uno, true);
 v.drawn = 'wild'; assert.deepEqual(botDecision(v), { type: 'pass' });
});
test('bot allows opponents their UNO grace period instead of catching early', () => {
 const v = projection(); v.unoDeadlines = { a: Date.now() + 5000 }; assert.notEqual(botDecision(v)?.type, 'catch');
});
test('server rejects start above room capacity and above ten players', () => {
 const g = soloGame('a', 'An', 'classic'); g.maxPlayers = 3;
 assert.throws(() => act(g, 'a', { type: 'start' }), /sức chứa/);
 g.maxPlayers = 12;
 while (g.players.length < 11) g.players.push({ id: String(g.players.length), name: 'Test', hand: [], uno: false, score: 0 });
 assert.throws(() => act(g, 'a', { type: 'start' }), /10 người/);
});
test('bots play complete Classic/Flip games at 2, 4 and 10 seats without invalid moves or lost cards', () => {
 for (const mode of ['classic', 'flip'] as const) for (const size of [2, 4, 10]) {
  let g: Game = empty('a', 'An', mode);
  while (g.players.length < size) g.players.push({ id: String(g.players.length), name: 'Bot', hand: [], uno: false, score: 0, bot: true });
  act(g, 'a', { type: 'start' });
  let steps = 0;
  while (g.status === 'playing' && steps++ < 15000) {
   const id = g.players[g.turn].id, a = botDecision(view(g, id, 'ABC234', steps));
   assert.ok(a); act(g, id, a);
   g = JSON.parse(JSON.stringify(g));
   const cards = [...g.deck, ...g.discard, ...g.players.flatMap(p => p.hand)];
   assert.equal(cards.length, deck(mode).length); assert.equal(new Set(cards.map(c => c.id)).size, cards.length);
  }
  assert.equal(g.status, 'finished', mode + ' / ' + size); assert.ok(Number.isFinite(g.roundPoints));
 }
});
