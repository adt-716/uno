import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = JSON.parse(readFileSync(new URL('img/flip_deck_112.json', root), 'utf8').replace(/^\uFEFF/, ''));
const lights = ['red', 'yellow', 'green', 'blue'];
const darks = ['pink', 'teal', 'orange', 'purple'];
const color = path => path.split('/').at(-2);
const value = path => path.split('/').at(-1).replace('.png', '');
const number = path => value(path).startsWith('number_');
// Fixed seed and sorted pools make regeneration independent of the previous pair order.
let seed = 20261107;
function random() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function shuffle(input) { const a = [...input]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const result = source.map(({ id, light }) => ({ id, light, dark: '' }));
const pools = new Map(darks.map(c => [c, source.map(c => c.dark).filter(path => color(path) === c).sort()]));
const wildFronts = result.filter(c => color(c.light) === 'wild');
const buckets = lights.map(() => []);

for (const dc of darks) {
 const paths = pools.get(dc);
 const numbers = shuffle(paths.filter(number));
 const actions = shuffle(paths.filter(p => !number(p)));
 // Each light Wild type receives all four dark colors, always number faces.
 const first = numbers.pop();
 const secondIndex = numbers.findIndex(p => p !== first);
 const [second] = numbers.splice(secondIndex, 1);
 wildFronts.find(c => value(c.light) === 'wild' && !c.dark).dark = first;
 wildFronts.find(c => value(c.light) === 'wild_draw_two' && !c.dark).dark = second;
 for (let row = 0; row < 4; row++) buckets[row].push(...numbers.splice(0, 4), ...actions.splice(0, 2));
 if (numbers.length || actions.length) throw new Error('Unexpected dark inventory: ' + dc);
}

function validPairs(cards, paired) {
 const seen = new Map();
 for (let i = 0; i < cards.length; i++) {
  const light = cards[i].light, dark = paired[i];
  if (value(light) === 'flip' && value(dark) === 'flip') return false;
  if (number(light) && number(dark) && value(light) === value(dark)) return false;
  if (seen.get(light) === color(dark)) return false;
  seen.set(light, color(dark));
 }
 return true;
}

for (const [row, lc] of lights.entries()) {
 const cards = result.filter(c => color(c.light) === lc);
 const darkActions = buckets[row].filter(p => !number(p));
 const darkNumbers = buckets[row].filter(number);
 const wild = ['wild', 'wild_draw_color'].map(v => 'cards/flip/dark/wild/' + v + '.png');
 const actionIndices = cards.map((c, i) => number(c.light) ? -1 : i).filter(i => i >= 0);
 const numberIndices = cards.map((c, i) => number(c.light) ? i : -1).filter(i => i >= 0);
 let paired;
 for (let attempt = 0; attempt < 30000; attempt++) {
  const a = shuffle(actionIndices), n = shuffle(numberIndices);
  const da = shuffle(darkActions), dn = shuffle(darkNumbers);
  const candidate = Array(26);
  // Three action/action pairs per light color; other strong faces are spread over numbers.
  a.slice(0, 3).forEach(i => { candidate[i] = da.pop(); });
  a.slice(3).forEach(i => { candidate[i] = dn.pop(); });
  const remainder = shuffle([...da, ...dn, ...wild]);
  n.forEach(i => { candidate[i] = remainder.pop(); });
  if (validPairs(cards, candidate)) { paired = candidate; break; }
 }
 if (!paired) throw new Error('Could not satisfy pairing constraints for ' + lc);
 cards.forEach((c, i) => { c.dark = paired[i]; });
}
if (result.length !== 112 || result.some(c => !c.dark)) throw new Error('Incomplete deck');
const json = JSON.stringify(result, null, 2) + '\n';
writeFileSync(new URL('img/flip_deck_112.json', root), json);
const policy = {
 id: 'uno-club-balanced-v1', seed: 20261107, physicalMattelPairing: false,
 deckSha256: createHash('sha256').update(json).digest('hex'),
 constraints: {
  cards: 112, coloredPairCountPerLightDarkColor: 6,
  darkWildPerLightColor: 1, darkWildDrawColorPerLightColor: 1,
  lightWildsPerDarkColor: 2, lightWildsPairedWithNumbersOnly: true,
  darkWildsPairedWithNumbersOnly: true, actionToActionPairsPerLightColor: 3,
  duplicateLightFacesHaveDifferentDarkColors: true,
  sameNumberOnBothSides: false, flipOnBothSides: false,
 },
};
writeFileSync(new URL('img/flip_pairing_policy.json', root), JSON.stringify(policy, null, 2) + '\n');
console.log('Built 112 balanced custom pairs, including 4 dark Wild Draw Color cards.');
console.log('Deck:', fileURLToPath(new URL('img/flip_deck_112.json', root)));
