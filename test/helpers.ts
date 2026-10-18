import { buildDeck, type Card, type CardKind, type Color } from '../src/shared/cards';
import type { Round } from '../src/server/round';

/** Deterministic PRNG so failures are reproducible. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLOR_CODES: Record<string, Color> = { r: 'red', y: 'yellow', g: 'green', b: 'blue' };
const KIND_CODES: Record<string, CardKind> = {
  S: 'skip',
  R: 'reverse',
  '+2': 'draw2',
  '@': 'rotate',
  '~': 'swap',
};

/**
 * Card shorthand: "r5" red 5, "bS" blue Skip, "gR" green Reverse, "y+2" yellow Draw Two,
 * "r@" red Rotate, "b~" blue Swap, "W" Wild, "W+4" Wild Draw Four.
 */
export function matches(spec: string): (card: Card) => boolean {
  if (spec === 'W') return (c) => c.kind === 'wild';
  if (spec === 'W+4') return (c) => c.kind === 'wild4';
  const color = COLOR_CODES[spec[0]!];
  const rest = spec.slice(1);
  if (!color) throw new Error(`Bad card spec ${spec}`);
  if (/^\d$/.test(rest)) return (c) => c.kind === 'number' && c.color === color && c.value === Number(rest);
  const kind = KIND_CODES[rest];
  if (!kind) throw new Error(`Bad card spec ${spec}`);
  return (c) => c.kind === kind && c.color === color;
}

export interface Rig {
  hands: Record<string, string[]>;
  top: string;
  color?: Color;
  /** Cards on top of the draw pile, first one drawn first. */
  drawTop?: string[];
}

/** Replace a round's dealt cards with a known arrangement, keeping all 116 cards in play. */
export function rig(round: Round, setup: Rig): void {
  const pool = buildDeck();
  const take = (spec: string): Card => {
    const index = pool.findIndex(matches(spec));
    if (index < 0) throw new Error(`No ${spec} left in the deck`);
    return pool.splice(index, 1)[0]!;
  };
  for (const player of round.players) player.hand = (setup.hands[player.id] ?? []).map(take);
  round.discard.splice(0, round.discard.length, take(setup.top));
  round.color = setup.color ?? round.top.color!;
  const drawTop = (setup.drawTop ?? []).map(take);
  round.drawPile = [...pool, ...drawTop.reverse()];
}

export function specOf(card: Card): string {
  if (card.kind === 'wild') return 'W';
  if (card.kind === 'wild4') return 'W+4';
  const color = card.color![0]!;
  if (card.kind === 'number') return `${color}${card.value}`;
  const code = Object.entries(KIND_CODES).find(([, kind]) => kind === card.kind)![0];
  return `${color}${code}`;
}

export function handSpecs(round: Round, playerId: string): string[] {
  return round.player(playerId)!.hand.map(specOf);
}

export function cardId(round: Round, playerId: string, spec: string): number {
  const card = round.player(playerId)!.hand.find(matches(spec));
  if (!card) throw new Error(`${playerId} has no ${spec}`);
  return card.id;
}
