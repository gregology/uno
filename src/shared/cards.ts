export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

export type CardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'rotate'
  | 'swap'
  | 'wild'
  | 'wild4';

export interface Card {
  id: number;
  kind: CardKind;
  /** null for wild cards */
  color: Color | null;
  /** 0-9 for number cards, null otherwise */
  value: number | null;
}

/** The kind of draw card a pending draw stack was last added to with. */
export type DrawKind = 'draw2' | 'wild4';

export const HAND_SIZE = 7;
export const MAX_PLAYERS = 8;

/**
 * Classic 108-card deck plus one Rotate and one Swap per colour (116 cards).
 * Per colour: one 0, two each of 1-9, two each of Skip/Reverse/Draw Two.
 */
export function buildDeck(): Card[] {
  const cards: Card[] = [];
  const add = (kind: CardKind, color: Color | null, value: number | null = null) => {
    cards.push({ id: cards.length, kind, color, value });
  };
  for (const color of COLORS) {
    add('number', color, 0);
    for (let value = 1; value <= 9; value++) {
      add('number', color, value);
      add('number', color, value);
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      add(kind, color);
      add(kind, color);
    }
    add('rotate', color);
    add('swap', color);
  }
  for (let i = 0; i < 4; i++) {
    add('wild', null);
    add('wild4', null);
  }
  return cards;
}

export const DECK_SIZE = 116;

export function isWild(card: Card): boolean {
  return card.kind === 'wild' || card.kind === 'wild4';
}

export function isDrawCard(card: Card): card is Card & { kind: DrawKind } {
  return card.kind === 'draw2' || card.kind === 'wild4';
}

export function drawValue(kind: DrawKind): number {
  return kind === 'draw2' ? 2 : 4;
}

/** Same colour and same symbol. Wilds are identical to wilds of the same kind. */
export function isIdentical(a: Card, b: Card): boolean {
  return a.kind === b.kind && a.color === b.color && a.value === b.value;
}

/** +2 on +2, +4 on +4 and +4 on +2, but never +2 on +4. */
export function canStack(card: Card, pendingKind: DrawKind): boolean {
  if (card.kind === 'wild4') return true;
  return card.kind === 'draw2' && pendingKind === 'draw2';
}

export interface PileState {
  top: Card;
  color: Color;
  pendingDraw: number;
  pendingKind: DrawKind | null;
}

/** Can the player whose turn it is play this card? */
export function canPlayOnTurn(card: Card, pile: PileState): boolean {
  if (pile.pendingDraw > 0 && pile.pendingKind) return canStack(card, pile.pendingKind);
  if (isWild(card)) return true;
  if (card.color === pile.color) return true;
  if (card.kind === 'number') return pile.top.kind === 'number' && pile.top.value === card.value;
  return card.kind === pile.top.kind;
}

/** Can a player play this card out of turn? */
export function canJumpIn(card: Card, pile: PileState): boolean {
  return isIdentical(card, pile.top);
}

const COLOR_ORDER: Record<string, number> = { red: 0, yellow: 1, green: 2, blue: 3 };
const KIND_ORDER: Record<CardKind, number> = {
  number: 0,
  skip: 1,
  reverse: 2,
  draw2: 3,
  rotate: 4,
  swap: 5,
  wild: 6,
  wild4: 7,
};

export function compareCards(a: Card, b: Card): number {
  const colorA = a.color ? COLOR_ORDER[a.color]! : 4;
  const colorB = b.color ? COLOR_ORDER[b.color]! : 4;
  return (
    colorA - colorB ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    (a.value ?? 0) - (b.value ?? 0) ||
    a.id - b.id
  );
}

const KIND_LABELS: Record<CardKind, string> = {
  number: '',
  skip: 'Skip',
  reverse: 'Reverse',
  draw2: 'Draw Two',
  rotate: 'Rotate',
  swap: 'Swap',
  wild: 'Wild',
  wild4: 'Wild Draw Four',
};

export function cardLabel(card: Card): string {
  if (isWild(card)) return KIND_LABELS[card.kind];
  const color = card.color![0]!.toUpperCase() + card.color!.slice(1);
  return card.kind === 'number' ? `${color} ${card.value}` : `${color} ${KIND_LABELS[card.kind]}`;
}
