import { randomBytes } from 'node:crypto';
import { COLORS, MAX_PLAYERS, type Card, type Color } from '../shared/cards';
import {
  AVATARS,
  NAME_MAX_LENGTH,
  REACTIONS,
  type Ack,
  type GameEvent,
  type MemberStatus,
  type Notice,
  type PublicPlayer,
  type TablePhase,
  type TableView,
  type UpdatePayload,
} from '../shared/protocol';
import { Round, shuffle, type Result, type Rng } from './round';

export interface TableClient {
  readonly id: string;
  send(event: 'update', payload: UpdatePayload): void;
  send(event: 'notice', payload: Notice): void;
}

export interface TableOptions {
  turnMs: number;
  maxStrikes: number;
  countdownMs: number;
  intermissionMs: number;
  /** Pause before picking up a draw stack for a player who can't add to it. */
  penaltyDelayMs: number;
  reactionCooldownMs: number;
  rng: Rng;
}

export const DEFAULT_OPTIONS: TableOptions = {
  turnMs: 30_000,
  maxStrikes: 5,
  countdownMs: 5_000,
  intermissionMs: 8_000,
  penaltyDelayMs: 1_500,
  reactionCooldownMs: 1_000,
  rng: Math.random,
};

interface Member {
  token: string;
  id: string;
  name: string;
  avatar: string;
  status: MemberStatus;
  wins: number;
  strikes: number;
  client: TableClient | null;
  /** When they joined the queue for a seat (or last left the table). */
  since: number;
  lastReactionAt: number;
}

interface Connection {
  client: TableClient;
  token: string | null;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_REMEMBERED_MEMBERS = 500;
const DISCARD_UNDER = 3;
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function cleanName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = text
    .normalize('NFC')
    // Control characters and bidirectional overrides; zero-width joiners stay for emoji.
    .replace(/[\p{Cc}‪-‮⁦-⁩﻿]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const graphemes = [...segmenter.segment(cleaned)].map((s) => s.segment);
  return graphemes.slice(0, NAME_MAX_LENGTH).join('').trim() || 'Player';
}

/**
 * The one table this server hosts: who's sitting where, the current round,
 * turn timers and what each connected phone gets to see.
 */
export class Table {
  phase: TablePhase = 'waiting';
  round: Round | null = null;
  roundId = 0;

  private readonly options: TableOptions;
  private readonly members = new Map<string, Member>();
  private readonly membersById = new Map<string, Member>();
  private readonly connections = new Map<string, Connection>();
  /** Seated member ids in turn order. Mirrors the round's order while one is in play. */
  private seats: string[] = [];
  /** Hands of players who left the current round, returned if they come back. */
  private readonly setAside = new Map<string, Card[]>();

  private turnTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimerSeq = -1;
  private turnDeadline = 0;
  private phaseTimer: ReturnType<typeof setTimeout> | null = null;
  private phaseDeadline = 0;

  constructor(options: Partial<TableOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  connect(client: TableClient): void {
    this.connections.set(client.id, { client, token: null });
    client.send('update', { events: [], view: this.view(null) });
  }

  disconnect(client: TableClient): void {
    const connection = this.connections.get(client.id);
    this.connections.delete(client.id);
    const member = connection?.token ? this.members.get(connection.token) : undefined;
    if (member?.client === client) {
      member.client = null;
      this.broadcast([]);
    }
  }

  /** Identify a connection by the token stored on the phone, reclaiming a seat if it has one. */
  hello(client: TableClient, token: unknown): Ack {
    const connection = this.connections.get(client.id);
    if (!connection) return { ok: false, error: 'Not connected' };
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) return { ok: false, error: 'Bad token' };
    connection.token = token;
    const member = this.members.get(token);
    if (member) {
      const previous = member.client;
      if (previous && previous !== client) {
        const old = this.connections.get(previous.id);
        if (old) old.token = null;
        previous.send('notice', { kind: 'replaced', message: 'You opened the game somewhere else.' });
        previous.send('update', { events: [], view: this.view(null) });
      }
      member.client = client;
      this.broadcast([]);
    } else {
      client.send('update', { events: [], view: this.view(null) });
    }
    return { ok: true };
  }

  join(client: TableClient, rawName: unknown, rawAvatar: unknown): Ack {
    const connection = this.connections.get(client.id);
    if (!connection?.token) return { ok: false, error: 'Say hello first' };
    let member = this.members.get(connection.token);
    if (member && member.status !== 'away') return { ok: true };

    const name = this.uniqueName(cleanName(rawName), member);
    const avatar = AVATARS.includes(rawAvatar as (typeof AVATARS)[number])
      ? (rawAvatar as string)
      : this.pick(AVATARS);
    if (!member) {
      this.forgetIdleMembers();
      member = {
        token: connection.token,
        id: randomBytes(6).toString('base64url'),
        name,
        avatar,
        status: 'away',
        wins: 0,
        strikes: 0,
        client,
        since: Date.now(),
        lastReactionAt: 0,
      };
      this.members.set(member.token, member);
      this.membersById.set(member.id, member);
    }
    member.name = name;
    member.avatar = avatar;
    member.client = client;
    member.strikes = 0;
    member.since = Date.now();

    const events: GameEvent[] = [];
    if (this.seats.length < MAX_PLAYERS) {
      this.seat(member, events);
    } else {
      member.status = 'waiting';
    }
    this.maybeStartCountdown();
    this.syncTurnTimer();
    this.broadcast(events);
    return { ok: true };
  }

  leave(client: TableClient): Ack {
    const member = this.memberFor(client);
    if (!member || member.status === 'away') return { ok: true };
    const events: GameEvent[] = [];
    this.unseat(member, 'left', events);
    this.syncTurnTimer();
    this.broadcast(events);
    return { ok: true };
  }

  play(client: TableClient, cardId: unknown): Ack {
    if (typeof cardId !== 'number') return { ok: false, error: 'Bad card' };
    return this.act(client, (round, id) => round.play(id, cardId));
  }

  draw(client: TableClient): Ack {
    return this.act(client, (round, id) => round.draw(id));
  }

  pass(client: TableClient): Ack {
    return this.act(client, (round, id) => round.pass(id));
  }

  chooseColor(client: TableClient, color: unknown): Ack {
    if (!COLORS.includes(color as Color)) return { ok: false, error: 'Bad colour' };
    return this.act(client, (round, id) => round.chooseColor(id, color as Color));
  }

  chooseSwap(client: TableClient, targetId: unknown): Ack {
    if (typeof targetId !== 'string') return { ok: false, error: 'Bad player' };
    return this.act(client, (round, id) => round.chooseSwap(id, targetId));
  }

  react(client: TableClient, emoji: unknown): Ack {
    const member = this.memberFor(client);
    if (!member || member.status === 'away') return { ok: false, error: 'Join the table first' };
    if (!REACTIONS.includes(emoji as (typeof REACTIONS)[number])) return { ok: false, error: 'Bad reaction' };
    const now = Date.now();
    if (now - member.lastReactionAt < this.options.reactionCooldownMs) return { ok: false, error: 'Slow down' };
    member.lastReactionAt = now;
    this.broadcast([{ type: 'reaction', playerId: member.id, emoji: emoji as string }]);
    return { ok: true };
  }

  /** Stop all timers (shutdown and tests). */
  dispose(): void {
    this.clearTurnTimer();
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  view(member: Member | null): TableView {
    const round = this.round;
    const players: PublicPlayer[] = this.seats.map((id) => {
      const m = this.membersById.get(id)!;
      return {
        id,
        name: m.name,
        avatar: m.avatar,
        cardCount: round?.player(id)?.hand.length ?? 0,
        wins: m.wins,
        connected: m.client !== null,
        strikes: m.strikes,
      };
    });
    const inPlay = this.phase === 'playing' && round !== null && !round.winnerId;
    const now = Date.now();
    const roundPlayer = member && round ? round.player(member.id) : undefined;
    return {
      phase: this.phase,
      roundId: this.roundId,
      players,
      spectators: this.waitingMembers().map(({ id, name, avatar }) => ({ id, name, avatar })),
      currentPlayerId: inPlay ? round.currentPlayer.id : null,
      direction: round?.direction ?? 1,
      topCard: round?.top ?? null,
      discardUnder: round ? round.discard.slice(-1 - DISCARD_UNDER, -1) : [],
      topPlayedBy: round?.topPlayedBy ?? null,
      color: round?.color ?? null,
      drawPileCount: round?.drawPile.length ?? 0,
      pendingDraw: round?.pendingDraw ?? 0,
      pendingKind: round?.pendingKind ?? null,
      pendingChoice: inPlay ? round.pendingChoice : null,
      turnMsRemaining: inPlay ? Math.max(0, this.turnDeadline - now) : null,
      turnMsTotal: this.options.turnMs,
      phaseMsRemaining: this.phaseTimer ? Math.max(0, this.phaseDeadline - now) : null,
      winnerId: round?.winnerId ?? null,
      maxStrikes: this.options.maxStrikes,
      me: member
        ? {
            id: member.id,
            status: member.status,
            name: member.name,
            avatar: member.avatar,
            hand: roundPlayer ? [...roundPlayer.hand] : [],
            drawnCardId: inPlay && round.currentPlayer.id === member.id ? round.drawnCardId : null,
          }
        : null,
    };
  }

  private act(client: TableClient, action: (round: Round, playerId: string) => Result): Ack {
    const member = this.memberFor(client);
    if (!member || member.status !== 'seated') return { ok: false, error: 'Join the table first' };
    const round = this.round;
    if (this.phase !== 'playing' || !round || round.winnerId) return { ok: false, error: 'No game in progress' };
    const result = action(round, member.id);
    if (!result.ok) return result;
    member.strikes = 0;
    this.afterRoundChange(result.events);
    return { ok: true };
  }

  private afterRoundChange(events: GameEvent[]): void {
    const round = this.round;
    if (round?.winnerId) this.endRound(round.winnerId);
    this.syncTurnTimer();
    this.broadcast(events);
  }

  private seat(member: Member, events: GameEvent[]): void {
    member.status = 'seated';
    const midGame = this.phase === 'playing' && this.round !== null;
    if (midGame) {
      const hand = this.setAside.get(member.id);
      this.setAside.delete(member.id);
      events.push({ type: 'joined', playerId: member.id, midGame: true });
      events.push(...this.round!.addPlayer(member.id, hand));
      this.seats = this.round!.players.map((p) => p.id);
    } else {
      this.seats.push(member.id);
      events.push({ type: 'joined', playerId: member.id, midGame: false });
    }
  }

  private unseat(member: Member, reason: 'left' | 'afk', events: GameEvent[]): void {
    const wasSeated = member.status === 'seated';
    member.status = 'away';
    member.since = Date.now();
    if (!wasSeated) return;

    const round = this.round;
    if (this.phase === 'playing' && round) {
      const removed = round.removePlayer(member.id);
      if (removed) {
        this.setAside.set(member.id, removed.hand);
        events.push(...removed.events);
      }
      this.seats = round.players.map((p) => p.id);
    } else {
      this.seats = this.seats.filter((id) => id !== member.id);
    }
    events.push({ type: 'left', playerId: member.id, reason });
    this.fillSeats(events);

    if (this.phase === 'playing' && this.seats.length < 2) {
      this.round = null;
      this.setAside.clear();
      this.phase = 'waiting';
      events.push({ type: 'roundAbandoned' });
    }
    if (this.phase === 'countdown' && this.seats.length < 2) {
      this.clearPhaseTimer();
      this.phase = 'waiting';
    }
  }

  /** Give free seats to whoever has been waiting longest. */
  private fillSeats(events: GameEvent[]): void {
    for (const member of this.waitingMembers()) {
      if (this.seats.length >= MAX_PLAYERS) break;
      this.seat(member, events);
    }
  }

  private maybeStartCountdown(): void {
    if (this.phase !== 'waiting' || this.seats.length < 2) return;
    this.phase = 'countdown';
    this.startPhaseTimer(this.options.countdownMs, () => this.startRound());
  }

  private startRound(): void {
    this.clearPhaseTimer();
    const events: GameEvent[] = [];
    this.fillSeats(events);
    if (this.seats.length < 2) {
      this.round = null;
      this.phase = 'waiting';
      this.broadcast(events);
      return;
    }
    this.seats = shuffle(this.seats, this.options.rng);
    this.round = new Round(this.seats, this.options.rng);
    this.roundId++;
    this.setAside.clear();
    this.phase = 'playing';
    events.push({ type: 'roundStart', roundId: this.roundId });
    this.syncTurnTimer();
    this.broadcast(events);
  }

  private endRound(winnerId: string): void {
    const winner = this.membersById.get(winnerId);
    if (winner) winner.wins++;
    this.phase = 'ended';
    this.setAside.clear();
    this.clearTurnTimer();
    this.startPhaseTimer(this.options.intermissionMs, () => this.startRound());
  }

  private onTurnTimeout(): void {
    this.turnTimer = null;
    const round = this.round;
    if (this.phase !== 'playing' || !round) return;
    const result = round.timeout();
    if (!result) return;
    const events: GameEvent[] = [];
    const member = this.membersById.get(result.playerId);
    if (member && result.strike) {
      member.strikes++;
      events.push({ type: 'timeout', playerId: member.id, strikes: member.strikes });
    }
    events.push(...result.events);
    if (member && member.strikes >= this.options.maxStrikes && member.status === 'seated') {
      this.unseat(member, 'afk', events);
      member.client?.send('notice', {
        kind: 'kicked',
        message: `You were removed after ${this.options.maxStrikes} turns in a row without playing.`,
      });
    }
    this.afterRoundChange(events);
  }

  private onPenaltyPickup(): void {
    this.turnTimer = null;
    const round = this.round;
    if (this.phase !== 'playing' || !round || !round.mustTakePenalty) {
      this.syncTurnTimer();
      return;
    }
    const result = round.draw(round.currentPlayer.id);
    this.afterRoundChange(result.ok ? result.events : []);
  }

  /** Restart the turn timer whenever the round says the turn moved on. */
  private syncTurnTimer(): void {
    const round = this.round;
    if (this.phase !== 'playing' || !round || round.winnerId) {
      this.clearTurnTimer();
      return;
    }
    if (this.turnTimer && this.turnTimerSeq === round.turnSeq) return;
    this.clearTurnTimer();
    this.turnTimerSeq = round.turnSeq;
    this.turnDeadline = Date.now() + this.options.turnMs;
    this.turnTimer = round.mustTakePenalty
      ? setTimeout(() => this.onPenaltyPickup(), this.options.penaltyDelayMs)
      : setTimeout(() => this.onTurnTimeout(), this.options.turnMs);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer) clearTimeout(this.turnTimer);
    this.turnTimer = null;
    this.turnTimerSeq = -1;
  }

  private startPhaseTimer(ms: number, then: () => void): void {
    this.clearPhaseTimer();
    this.phaseDeadline = Date.now() + ms;
    this.phaseTimer = setTimeout(() => {
      this.phaseTimer = null;
      then();
    }, ms);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) clearTimeout(this.phaseTimer);
    this.phaseTimer = null;
  }

  private broadcast(events: GameEvent[]): void {
    for (const { client, token } of this.connections.values()) {
      const member = token ? this.members.get(token) : undefined;
      const view = this.view(member && member.client === client ? member : null);
      client.send('update', { events, view });
    }
  }

  private memberFor(client: TableClient): Member | undefined {
    const token = this.connections.get(client.id)?.token;
    const member = token ? this.members.get(token) : undefined;
    return member?.client === client ? member : undefined;
  }

  private waitingMembers(): Member[] {
    return [...this.members.values()]
      .filter((m) => m.status === 'waiting')
      .sort((a, b) => a.since - b.since);
  }

  private uniqueName(name: string, self: Member | undefined): string {
    const taken = new Set(
      [...this.members.values()]
        .filter((m) => m !== self && m.status !== 'away')
        .map((m) => m.name.toLowerCase()),
    );
    if (!taken.has(name.toLowerCase())) return name;
    for (let n = 2; ; n++) {
      const candidate = `${name} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  /** Keep memory bounded: drop the oldest members who aren't at the table or connected. */
  private forgetIdleMembers(): void {
    if (this.members.size < MAX_REMEMBERED_MEMBERS) return;
    const idle = [...this.members.values()]
      .filter((m) => m.status === 'away' && !m.client)
      .sort((a, b) => a.since - b.since);
    const excess = this.members.size - MAX_REMEMBERED_MEMBERS / 2;
    for (const member of idle.slice(0, Math.max(0, excess))) {
      this.members.delete(member.token);
      this.membersById.delete(member.id);
    }
  }

  private pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.options.rng() * items.length)]!;
  }
}
