import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECK_SIZE } from '../src/shared/cards';
import type { GameEvent, Notice, UpdatePayload } from '../src/shared/protocol';
import { cleanName, Table, type TableClient, type TableOptions } from '../src/server/table';
import { cardId, rig, seeded } from './helpers';

class FakeClient implements TableClient {
  updates: UpdatePayload[] = [];
  notices: Notice[] = [];
  constructor(readonly id: string) {}
  send(event: 'update' | 'notice', payload: UpdatePayload | Notice): void {
    if (event === 'update') this.updates.push(payload as UpdatePayload);
    else this.notices.push(payload as Notice);
  }
  get view() {
    return this.updates.at(-1)!.view;
  }
  get me() {
    return this.view.me!;
  }
  events(): GameEvent[] {
    return this.updates.flatMap((u) => u.events);
  }
}

const token = (n: number | string) => `token-${n}-abcdefghijklmnop`;

function setup(count: number, options: Partial<TableOptions> = {}) {
  const table = new Table({ rng: seeded(7), ...options });
  const clients = Array.from({ length: count }, (_, i) => connect(table, i));
  return { table, clients };
}

function connect(table: Table, n: number | string, name = `P${n}`): FakeClient {
  const client = new FakeClient(`socket-${n}-${Math.random()}`);
  table.connect(client);
  table.hello(client, token(n));
  table.join(client, name, '🦊');
  return client;
}

function start(table: Table) {
  vi.advanceTimersByTime(5_000);
  expect(table.phase).toBe('playing');
}

function byId(clients: FakeClient[], id: string): FakeClient {
  return clients.find((c) => c.view.me?.id === id)!;
}

function currentClient(table: Table, clients: FakeClient[]): FakeClient {
  return byId(clients, table.round!.currentPlayer.id);
}

/** Make the current player take a harmless turn: draw, and keep the card if it was playable. */
function drawTurn(table: Table, client: FakeClient) {
  expect(table.draw(client).ok).toBe(true);
  if (table.round!.drawnCardId !== null) expect(table.pass(client).ok).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting a game', () => {
  it('waits for a second player, counts down and deals', () => {
    const { table, clients } = setup(1);
    expect(table.phase).toBe('waiting');
    clients.push(connect(table, 1));
    expect(table.phase).toBe('countdown');
    expect(clients[0]!.view.phaseMsRemaining).toBe(5_000);
    start(table);
    for (const client of clients) {
      expect(client.me.hand).toHaveLength(7);
      expect(client.view.players.map((p) => p.cardCount)).toEqual([7, 7]);
    }
    expect(clients[0]!.events()).toContainEqual({ type: 'roundStart', roundId: 1 });
    table.dispose();
  });

  it('only ever sends a player their own hand', () => {
    const { table, clients } = setup(3);
    start(table);
    const [a, b] = clients;
    const bCards = new Set(b!.me.hand.map((c) => c.id));
    expect(a!.me.hand.some((c) => bCards.has(c.id))).toBe(false);
    const visitor = new FakeClient('visitor');
    table.connect(visitor);
    expect(visitor.view.me).toBeNull();
    expect(visitor.view.players).toHaveLength(3);
    table.dispose();
  });
});

describe('turn timer', () => {
  it('picks up a card when the timer runs out and counts a strike', () => {
    const { table, clients } = setup(2);
    start(table);
    const idle = currentClient(table, clients);
    vi.advanceTimersByTime(30_000);
    expect(idle.me.hand.length).toBeGreaterThan(7);
    expect(idle.events()).toContainEqual({ type: 'timeout', playerId: idle.me.id, strikes: 1 });
    expect(table.round!.currentPlayer.id).not.toBe(idle.me.id);
    table.dispose();
  });

  it('removes a player after five automatic turns in a row', () => {
    const { table, clients } = setup(3);
    start(table);
    const idle = currentClient(table, clients);
    let timeouts = 0;
    while (idle.me.status === 'seated') {
      const current = currentClient(table, clients);
      if (current === idle) {
        vi.advanceTimersByTime(30_000);
        timeouts++;
      } else {
        drawTurn(table, current);
      }
    }
    expect(timeouts).toBe(5);
    expect(idle.notices.at(-1)?.kind).toBe('kicked');
    expect(idle.events()).toContainEqual({ type: 'left', playerId: idle.me.id, reason: 'afk' });
    expect(table.round!.players).toHaveLength(2);
    table.dispose();
  });

  it('resets the strike count when the player acts', () => {
    const { table, clients } = setup(2);
    start(table);
    const player = currentClient(table, clients);
    vi.advanceTimersByTime(30_000);
    drawTurn(table, currentClient(table, clients));
    expect(table.round!.currentPlayer.id).toBe(player.me.id);
    expect(player.view.players.find((p) => p.id === player.me.id)!.strikes).toBe(1);
    drawTurn(table, player);
    expect(player.view.players.find((p) => p.id === player.me.id)!.strikes).toBe(0);
    table.dispose();
  });

  it('picks up a stack shortly, without a strike, for a player who cannot add to it', () => {
    const { table, clients } = setup(2);
    start(table);
    const round = table.round!;
    const [first, second] = round.players.map((p) => p.id) as [string, string];
    rig(round, { hands: { [first]: ['r+2', 'r1'], [second]: ['b1', 'g1'] }, top: 'r5' });
    const attacker = byId(clients, first);
    const victim = byId(clients, second);
    expect(table.play(attacker, cardId(round, first, 'r+2')).ok).toBe(true);
    vi.advanceTimersByTime(1_500);
    expect(table.round!.player(second)!.hand).toHaveLength(4);
    expect(victim.view.players.find((p) => p.id === second)!.strikes).toBe(0);
    expect(table.round!.currentPlayer.id).toBe(first);
    table.dispose();
  });
});

describe('joining and leaving', () => {
  it('deals a late joiner in to play last', () => {
    const { table, clients } = setup(2);
    start(table);
    const before = table.round!.players.map((p) => p.id);
    const currentId = table.round!.currentPlayer.id;
    const late = connect(table, 'late');
    expect(late.me.hand).toHaveLength(7);
    const order = table.round!.players.map((p) => p.id);
    expect(order).toHaveLength(3);
    // The newcomer sits just before the current player in the direction of play.
    const lateIndex = order.indexOf(late.me.id);
    expect(order[(lateIndex + 1) % 3]).toBe(currentId);
    expect(order.filter((id) => id !== late.me.id)).toEqual(before);
    table.dispose();
  });

  it('gives a player their old hand back if they return in the same round', () => {
    const { table, clients } = setup(3);
    start(table);
    const leaver = clients[2]!;
    const hand = leaver.me.hand.map((c) => c.id).sort();
    table.leave(leaver);
    expect(leaver.me.status).toBe('away');
    expect(table.round!.players).toHaveLength(2);
    table.join(leaver, 'P2', '🦊');
    expect(leaver.me.hand.map((c) => c.id).sort()).toEqual(hand);
    expect(table.round!.allCards()).toHaveLength(DECK_SIZE);
    table.dispose();
  });

  it('makes the ninth visitor wait and seats them when someone leaves', () => {
    const { table, clients } = setup(8);
    start(table);
    const ninth = connect(table, 9);
    expect(ninth.me.status).toBe('waiting');
    expect(ninth.view.spectators.map((s) => s.id)).toEqual([ninth.me.id]);
    table.leave(clients[0]!);
    expect(ninth.me.status).toBe('seated');
    expect(ninth.me.hand).toHaveLength(7);
    table.dispose();
  });

  it('abandons the round when only one player is left', () => {
    const { table, clients } = setup(2);
    start(table);
    table.leave(clients[0]!);
    expect(table.phase).toBe('waiting');
    expect(clients[1]!.events()).toContainEqual({ type: 'roundAbandoned' });
    table.dispose();
  });

  it('reconnects a returning phone to its seat and retires the old connection', () => {
    const { table, clients } = setup(2);
    start(table);
    const old = clients[0]!;
    const hand = old.me.hand;
    const fresh = new FakeClient('fresh');
    table.connect(fresh);
    table.hello(fresh, token(0));
    expect(fresh.me.hand).toEqual(hand);
    expect(fresh.me.status).toBe('seated');
    expect(old.notices.at(-1)?.kind).toBe('replaced');
    expect(old.view.me).toBeNull();
    expect(table.draw(old).ok).toBe(false);
    table.dispose();
  });

  it('shows disconnected players to everyone else', () => {
    const { table, clients } = setup(2);
    table.disconnect(clients[0]!);
    expect(clients[1]!.view.players.find((p) => p.name === 'P0')!.connected).toBe(false);
    table.dispose();
  });

  it('keeps names unique and tidy', () => {
    const { table, clients } = setup(1);
    const twin = connect(table, 1, 'P0');
    expect(twin.me.name).toBe('P0 2');
    expect(clients[0]!.me.name).toBe('P0');
    expect(cleanName('  Ana‮\u0000  Bo  ')).toBe('Ana Bo');
    expect(cleanName('')).toBe('Player');
    expect(cleanName('👨‍👩‍👧‍👦'.repeat(20))).toBe('👨‍👩‍👧‍👦'.repeat(16));
    table.dispose();
  });
});

describe('between games', () => {
  it('celebrates the winner then deals a new game with shuffled seats', () => {
    const { table, clients } = setup(3);
    start(table);
    const round = table.round!;
    const winnerId = round.currentPlayer.id;
    rig(round, { hands: { [winnerId]: ['r1'] }, top: 'r5' });
    for (const p of round.players) if (p.id !== winnerId) p.hand = round.drawPile.splice(0, 3);
    const winner = byId(clients, winnerId);
    expect(table.play(winner, cardId(round, winnerId, 'r1')).ok).toBe(true);
    expect(table.phase).toBe('ended');
    expect(winner.view.winnerId).toBe(winnerId);
    expect(winner.view.players.find((p) => p.id === winnerId)!.wins).toBe(1);
    expect(winner.view.phaseMsRemaining).toBe(8_000);
    vi.advanceTimersByTime(8_000);
    expect(table.phase).toBe('playing');
    expect(table.roundId).toBe(2);
    expect(winner.me.hand).toHaveLength(7);
    table.dispose();
  });

  it('rate-limits emoji reactions', () => {
    const { table, clients } = setup(2);
    expect(table.react(clients[0]!, '🎉').ok).toBe(true);
    expect(table.react(clients[0]!, '🎉').ok).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(table.react(clients[0]!, '🔥').ok).toBe(true);
    expect(table.react(clients[0]!, 'nope').ok).toBe(false);
    table.dispose();
  });
});
