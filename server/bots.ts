import { randomUUID } from 'node:crypto';
import { colors, darkColors, type Action, type Game, type Mode, type PublicCard, type View } from '../shared/types';
import { empty } from './engine';


export const BOT_DELAY = 850;
export function soloGame(host: string, name: string, mode: Mode): Game {
 const g = empty(host, name, mode); g.kind = 'solo'; g.maxPlayers = 4;
 for (const name of ['Máy Mây', 'Máy Nắng', 'Máy Gió']) {
  g.players.push({ id: randomUUID(), name, hand: [], uno: false, score: 0, bot: true });
 }
 return g;
}
// Receives exactly a player's public projection, never the deck, opposing hands or guilty flag.
export function botDecision(v: View): Action | null {
 if (v.status !== 'playing' || v.players[v.turn]?.id !== v.me) return null;
 const palette = v.mode === 'flip' && v.side === 'dark' ? darkColors : colors;
 const counts = new Map<string, number>(palette.map(c => [c, v.hand.filter(card => card.color === c).length]));
 const bestColor = [...palette].sort((a, b) => counts.get(b)! - counts.get(a)!)[0];
 if (v.choosingColor) return { type: 'chooseColor', color: bestColor };
 if (v.pending) return { type: 'accept' };
 const hasMatchingColor = v.hand.some(c => c.color === v.color);
 const playable = v.hand.filter(c => (!v.drawn || c.id === v.drawn) &&
  (c.color === 'wild' || c.color === v.color || c.value === v.top?.value) &&
  !(hasMatchingColor && ['wild_draw_four', 'wild_draw_two', 'wild_draw_color'].includes(c.value)));
 const rank = (c: PublicCard) => {
  if (c.color === 'wild') return c.value === 'wild' ? -10 : -5;
  const action = ({ skip_everyone: 50, draw_five: 40, draw_two: 30, draw_one: 25, skip: 20, reverse: 15, flip: 10 } as Record<string, number>)[c.value];
  return (action ?? Number(c.value.replace('number_', ''))) + (counts.get(c.color) ?? 0) * 2;
 };
 const c = playable.sort((a, b) => rank(b) - rank(a))[0];
 return c ? { type: 'play', cardId: c.id, color: bestColor, uno: true } : { type: v.drawn ? 'pass' : 'draw' };
}


