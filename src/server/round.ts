import {
  buildDeck,
  canJumpIn,
  canPlayOnTurn,
  canStack,
  COLORS,
  drawValue,
  HAND_SIZE,
  isWild,
  type Card,
  type Color,
  type DrawKind,
  type PileState,
} from '../shared/cards';
import type { GameEvent } from '../shared/protocol';

export type Rng = () => number;

export interface RoundPlayer {
  id: string;
  hand: Card[];
}

export interface PendingChoice {
  type: 'color' | 'swap';
  playerId: string;
}

export type Result = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export interface TimeoutResult {
  playerId: string;
  events: GameEvent[];
  /** True when the server had to take the whole turn for an idle player. */
  strike: boolean;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const fail = (error: string): Result => ({ ok: false, error });
const ok = (events: GameEvent[]): Result => ({ ok: true, events });
const eventsOf = (result: Result): GameEvent[] => (result.ok ? result.events : []);

/**
 * One game of UNO, from the deal until somebody plays their last card.
 * Pure rules: no timers or networking. Every action returns the events it caused.
 */
export class Round {
  readonly players: RoundPlayer[];
  current = 0;
  direction: 1 | -1 = 1;
  drawPile: Card[];
  readonly discard: Card[] = [];
  color: Color;
  pendingDraw = 0;
  pendingKind: DrawKind | null = null;
  pendingChoice: PendingChoice | null = null;
  /** Card the current player drew this turn and may still play instead of keeping. */
  drawnCardId: number | null = null;
  /** Who played the top card. Players can't jump in on their own card. */
  topPlayedBy: string | null = null;
  winnerId: string | null = null;
  /** Increments whenever the turn timer should restart. */
  turnSeq = 0;

  constructor(
    playerIds: readonly string[],
    private readonly rng: Rng = Math.random,
    deck: readonly Card[] = buildDeck(),
  ) {
    if (playerIds.length < 2) throw new Error('A round needs at least two players');
    this.drawPile = shuffle(deck, rng);
    this.players = playerIds.map((id) => ({ id, hand: [] }));
    for (let i = 0; i < HAND_SIZE; i++) {
      for (const player of this.players) player.hand.push(this.drawPile.pop()!);
    }
    // Start on a number card so the first turn has no special effect.
    const startIndex = this.drawPile.findLastIndex((card) => card.kind === 'number');
    const start = this.drawPile.splice(startIndex, 1)[0]!;
    this.discard.push(start);
    this.color = start.color!;
  }

  get top(): Card {
    return this.discard[this.discard.length - 1]!;
  }

  get currentPlayer(): RoundPlayer {
    return this.players[this.current]!;
  }

  get pile(): PileState {
    return {
      top: this.top,
      color: this.color,
      pendingDraw: this.pendingDraw,
      pendingKind: this.pendingKind,
    };
  }

  /** The current player faces a draw stack and holds nothing that can be added to it. */
  get mustTakePenalty(): boolean {
    return (
      !this.winnerId &&
      !this.pendingChoice &&
      this.pendingDraw > 0 &&
      !this.currentPlayer.hand.some((card) => canStack(card, this.pendingKind!))
    );
  }

  player(id: string): RoundPlayer | undefined {
    return this.players.find((p) => p.id === id);
  }

  play(playerId: string, cardId: number): Result {
    if (this.winnerId) return fail('The game is over');
    if (this.pendingChoice) return fail('Waiting for a choice to be made');
    const index = this.indexOf(playerId);
    if (index < 0) return fail('You are not in this game');
    const player = this.players[index]!;
    const handIndex = player.hand.findIndex((card) => card.id === cardId);
    if (handIndex < 0) return fail('That card is not in your hand');
    const card = player.hand[handIndex]!;

    const onTurn = index === this.current;
    if (onTurn) {
      if (this.drawnCardId !== null && card.id !== this.drawnCardId) {
        return fail('You can only play the card you just drew');
      }
      if (!canPlayOnTurn(card, this.pile)) return fail("That card can't be played right now");
    } else {
      if (!canJumpIn(card, this.pile)) return fail("It's not your turn");
      if (this.topPlayedBy === playerId) return fail("You can't jump in on your own card");
    }

    player.hand.splice(handIndex, 1);
    this.discard.push(card);
    this.topPlayedBy = playerId;
    // Play carries on from whoever played, which matters for jump-ins.
    this.current = index;
    this.drawnCardId = null;
    if (!isWild(card)) this.color = card.color!;
    const events: GameEvent[] = [{ type: 'play', playerId, card, jumpIn: !onTurn }];

    if (player.hand.length === 0) {
      // Going out wins at once: no colour choice, penalty, rotate or swap happens.
      this.winnerId = playerId;
      this.pendingDraw = 0;
      this.pendingKind = null;
      this.turnSeq++;
      events.push({ type: 'win', playerId });
      return ok(events);
    }
    // Rotate and Swap move hands around, so they report last cards after the move.
    if (player.hand.length === 1 && card.kind !== 'rotate' && card.kind !== 'swap') {
      events.push({ type: 'lastCard', playerId });
    }

    switch (card.kind) {
      case 'number':
        this.advance(1);
        break;
      case 'skip':
        events.push({ type: 'skip', playerId: this.players[this.nextIndex()]!.id });
        this.advance(2);
        break;
      case 'reverse':
        this.direction = this.direction === 1 ? -1 : 1;
        events.push({ type: 'reverse', direction: this.direction });
        if (this.players.length === 2) {
          // With two players a Reverse works like a Skip.
          events.push({ type: 'skip', playerId: this.players[this.nextIndex()]!.id });
          this.advance(2);
        } else {
          this.advance(1);
        }
        break;
      case 'draw2':
        this.addToStack('draw2');
        this.advance(1);
        break;
      case 'wild4':
        this.addToStack('wild4');
        this.beginChoice('color', playerId);
        break;
      case 'wild':
        this.beginChoice('color', playerId);
        break;
      case 'swap':
        this.beginChoice('swap', playerId);
        break;
      case 'rotate':
        this.rotateHands();
        events.push({ type: 'rotate', direction: this.direction });
        events.push(...this.lastCardEvents(this.players));
        this.advance(1);
        break;
    }
    return ok(events);
  }

  chooseColor(playerId: string, color: Color): Result {
    const choice = this.pendingChoice;
    if (choice?.type !== 'color' || choice.playerId !== playerId) return fail('There is no colour to choose');
    if (!COLORS.includes(color)) return fail('Unknown colour');
    this.color = color;
    this.pendingChoice = null;
    this.advance(1);
    return ok([{ type: 'color', playerId, color }]);
  }

  chooseSwap(playerId: string, targetId: string): Result {
    const choice = this.pendingChoice;
    if (choice?.type !== 'swap' || choice.playerId !== playerId) return fail('There is nobody to swap with');
    if (targetId === playerId) return fail('Pick another player');
    const player = this.player(playerId)!;
    const target = this.player(targetId);
    if (!target) return fail('That player is not in the game');
    [player.hand, target.hand] = [target.hand, player.hand];
    this.pendingChoice = null;
    const events: GameEvent[] = [
      { type: 'swap', playerId, targetId },
      ...this.lastCardEvents([player, target]),
    ];
    this.advance(1);
    return ok(events);
  }

  /** Draw a card, or take the whole pending stack. */
  draw(playerId: string): Result {
    if (this.winnerId) return fail('The game is over');
    if (this.pendingChoice) return fail('Waiting for a choice to be made');
    if (this.currentPlayer.id !== playerId) return fail("It's not your turn");
    const player = this.currentPlayer;
    const events: GameEvent[] = [];

    if (this.pendingDraw > 0) {
      const drawn = this.drawInto(player, this.pendingDraw, events);
      events.push({ type: 'draw', playerId, count: drawn.length, penalty: true });
      this.pendingDraw = 0;
      this.pendingKind = null;
      this.advance(1);
      return ok(events);
    }

    if (this.drawnCardId !== null) return fail('You already drew a card');
    const [card] = this.drawInto(player, 1, events);
    if (!card) {
      events.push({ type: 'pass', playerId });
      this.advance(1);
      return ok(events);
    }
    events.push({ type: 'draw', playerId, count: 1, penalty: false });
    if (canPlayOnTurn(card, this.pile)) {
      this.drawnCardId = card.id;
      this.turnSeq++;
    } else {
      this.advance(1);
    }
    return ok(events);
  }

  /** Keep the playable card you just drew and end your turn. */
  pass(playerId: string): Result {
    if (this.winnerId) return fail('The game is over');
    if (this.currentPlayer.id !== playerId || this.drawnCardId === null) return fail("You can't pass right now");
    this.advance(1);
    return ok([{ type: 'pass', playerId }]);
  }

  /** The turn timer ran out: finish whatever the current player was doing for them. */
  timeout(): TimeoutResult | null {
    if (this.winnerId) return null;
    if (this.pendingChoice) {
      const { type, playerId } = this.pendingChoice;
      const result =
        type === 'color'
          ? this.chooseColor(playerId, this.pick(COLORS))
          : this.chooseSwap(playerId, this.pick(this.players.filter((p) => p.id !== playerId)).id);
      return { playerId, events: eventsOf(result), strike: false };
    }
    const playerId = this.currentPlayer.id;
    if (this.drawnCardId !== null) {
      return { playerId, events: eventsOf(this.pass(playerId)), strike: false };
    }
    // Pick up for them. A playable drawn card is kept, never played automatically.
    const events = eventsOf(this.draw(playerId));
    if (this.drawnCardId !== null) events.push(...eventsOf(this.pass(playerId)));
    return { playerId, events, strike: true };
  }

  /** Seat a late joiner so they play after everyone already in the round. */
  addPlayer(id: string, hand?: Card[]): GameEvent[] {
    if (this.winnerId || this.indexOf(id) >= 0) return [];
    const player: RoundPlayer = { id, hand: hand ?? [] };
    if (this.direction === 1) {
      this.players.splice(this.current, 0, player);
      this.current += 1;
    } else {
      this.players.splice(this.current + 1, 0, player);
    }
    const events: GameEvent[] = [];
    if (!hand) {
      const drawn = this.drawInto(player, HAND_SIZE, events);
      events.push({ type: 'draw', playerId: id, count: drawn.length, penalty: false });
    }
    events.push(...this.lastCardEvents([player]));
    return events;
  }

  /** Take a player out of the round, returning the hand they leave with. */
  removePlayer(id: string): { hand: Card[]; events: GameEvent[] } | null {
    let index = this.indexOf(id);
    if (index < 0) return null;
    const player = this.players[index]!;
    const events: GameEvent[] = [];

    if (this.pendingChoice?.playerId === id) {
      if (this.pendingChoice.type === 'color') {
        events.push(...eventsOf(this.chooseColor(id, this.pick(COLORS))));
      } else {
        this.pendingChoice = null;
        this.advance(1);
      }
    }
    // Leaving doesn't dodge a draw stack: the leaver takes it with them.
    if (index === this.current && this.pendingDraw > 0) {
      this.drawInto(player, this.pendingDraw, events);
      this.pendingDraw = 0;
      this.pendingKind = null;
    }

    const wasCurrent = index === this.current;
    this.players.splice(index, 1);
    const count = this.players.length;
    if (count === 0) {
      this.current = 0;
    } else if (index < this.current) {
      this.current -= 1;
    } else if (wasCurrent) {
      if (this.direction === -1) index -= 1;
      this.current = ((index % count) + count) % count;
      this.drawnCardId = null;
      this.turnSeq++;
    }
    return { hand: player.hand, events };
  }

  /** Every card in the round, wherever it is. Useful for invariants in tests. */
  allCards(): Card[] {
    return [...this.drawPile, ...this.discard, ...this.players.flatMap((p) => p.hand)];
  }

  private indexOf(id: string): number {
    return this.players.findIndex((p) => p.id === id);
  }

  private nextIndex(from = this.current, steps = 1): number {
    const count = this.players.length;
    return (((from + this.direction * steps) % count) + count) % count;
  }

  private advance(steps: number): void {
    this.current = this.nextIndex(this.current, steps);
    this.drawnCardId = null;
    this.turnSeq++;
  }

  private beginChoice(type: PendingChoice['type'], playerId: string): void {
    this.pendingChoice = { type, playerId };
    this.turnSeq++;
  }

  private addToStack(kind: DrawKind): void {
    this.pendingDraw += drawValue(kind);
    this.pendingKind = kind;
  }

  /** Every hand moves to the next player in the current direction of play. */
  private rotateHands(): void {
    const hands = this.players.map((p) => p.hand);
    hands.forEach((hand, i) => {
      this.players[this.nextIndex(i)]!.hand = hand;
    });
  }

  private lastCardEvents(players: readonly RoundPlayer[]): GameEvent[] {
    return players
      .filter((p) => p.hand.length === 1)
      .map((p) => ({ type: 'lastCard', playerId: p.id }) as const);
  }

  private drawInto(player: RoundPlayer, count: number, events: GameEvent[]): Card[] {
    const drawn: Card[] = [];
    for (let i = 0; i < count; i++) {
      if (this.drawPile.length === 0 && !this.reshuffle(events)) break;
      const card = this.drawPile.pop()!;
      player.hand.push(card);
      drawn.push(card);
    }
    return drawn;
  }

  /** Shuffle the discard pile (except the top card) back into the draw pile. */
  private reshuffle(events: GameEvent[]): boolean {
    if (this.discard.length <= 1) return false;
    const top = this.discard.pop()!;
    this.drawPile = shuffle(this.discard.splice(0), this.rng);
    this.discard.push(top);
    events.push({ type: 'reshuffle' });
    return true;
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)]!;
  }
}
