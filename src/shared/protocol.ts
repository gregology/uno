import type { Card, Color, DrawKind } from './cards';

export const AVATARS = [
  '🦊', '🐸', '🐼', '🐯', '🐙', '🦄', '🐵', '🐨',
  '🐷', '🐮', '🦁', '🐰', '🐔', '🐧', '🐳', '🦖',
] as const;

export const REACTIONS = ['😂', '😱', '😡', '🎉', '😭', '🔥', '👏', '🤡'] as const;

export const NAME_MAX_LENGTH = 16;

export type TablePhase = 'waiting' | 'countdown' | 'playing' | 'ended';

/** away = not at the table, seated = has a seat, waiting = joined but the table is full */
export type MemberStatus = 'away' | 'seated' | 'waiting';

export type GameEvent =
  | { type: 'play'; playerId: string; card: Card; jumpIn: boolean }
  | { type: 'draw'; playerId: string; count: number; penalty: boolean }
  | { type: 'pass'; playerId: string }
  | { type: 'skip'; playerId: string }
  | { type: 'reverse'; direction: 1 | -1 }
  | { type: 'color'; playerId: string; color: Color }
  | { type: 'rotate'; direction: 1 | -1 }
  | { type: 'swap'; playerId: string; targetId: string }
  | { type: 'lastCard'; playerId: string }
  | { type: 'win'; playerId: string }
  | { type: 'reshuffle' }
  | { type: 'timeout'; playerId: string; strikes: number }
  | { type: 'joined'; playerId: string; midGame: boolean }
  | { type: 'left'; playerId: string; reason: 'left' | 'afk' }
  | { type: 'roundStart'; roundId: number }
  | { type: 'roundAbandoned' }
  | { type: 'reaction'; playerId: string; emoji: string };

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  cardCount: number;
  wins: number;
  connected: boolean;
  /** Consecutive turns the server played automatically for this player. */
  strikes: number;
}

export interface Spectator {
  id: string;
  name: string;
  avatar: string;
}

export interface MeView {
  id: string;
  status: MemberStatus;
  name: string;
  avatar: string;
  hand: Card[];
  /** The card drawn this turn that may still be played (all other cards are locked). */
  drawnCardId: number | null;
}

export interface TableView {
  phase: TablePhase;
  roundId: number;
  /** Seated players in turn order (array order, play moves in `direction`). */
  players: PublicPlayer[];
  spectators: Spectator[];
  currentPlayerId: string | null;
  direction: 1 | -1;
  topCard: Card | null;
  /** A few cards under the top card, oldest first, for the look of the pile. */
  discardUnder: Card[];
  topPlayedBy: string | null;
  color: Color | null;
  drawPileCount: number;
  pendingDraw: number;
  pendingKind: DrawKind | null;
  pendingChoice: { type: 'color' | 'swap'; playerId: string } | null;
  /** Milliseconds left in the current turn when this view was sent. */
  turnMsRemaining: number | null;
  turnMsTotal: number;
  /** Milliseconds until the next round starts (countdown and ended phases). */
  phaseMsRemaining: number | null;
  winnerId: string | null;
  me: MeView | null;
  maxStrikes: number;
}

export interface UpdatePayload {
  events: GameEvent[];
  view: TableView;
}

export type Notice =
  | { kind: 'kicked'; message: string }
  | { kind: 'replaced'; message: string };

export type Ack = { ok: true } | { ok: false; error: string };

/** Client to server messages and their payloads. */
export interface ClientMessages {
  hello: { token: string };
  join: { name: string; avatar: string };
  leave: Record<string, never>;
  play: { cardId: number };
  draw: Record<string, never>;
  pass: Record<string, never>;
  chooseColor: { color: Color };
  chooseSwap: { targetId: string };
  react: { emoji: string };
}

export type ClientMessage = keyof ClientMessages;
