import { describe, expect, it } from 'vitest';
import { buildDeck, canPlayOnTurn, canStack, DECK_SIZE, type Card } from '../src/shared/cards';
import { Round } from '../src/server/round';
import { cardId, handSpecs, rig, seeded, specOf } from './helpers';

function round(ids = ['a', 'b', 'c', 'd'], seed = 1): Round {
  return new Round(ids, seeded(seed));
}

function play(r: Round, playerId: string, spec: string) {
  const result = r.play(playerId, cardId(r, playerId, spec));
  if (!result.ok) throw new Error(result.error);
  return result.events;
}

describe('deck', () => {
  it('has the classic 108 cards plus one Rotate and one Swap per colour', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const count = (kind: Card['kind']) => deck.filter((c) => c.kind === kind).length;
    expect(count('number')).toBe(76);
    expect(count('skip')).toBe(8);
    expect(count('reverse')).toBe(8);
    expect(count('draw2')).toBe(8);
    expect(count('rotate')).toBe(4);
    expect(count('swap')).toBe(4);
    expect(count('wild')).toBe(4);
    expect(count('wild4')).toBe(4);
    expect(deck.filter((c) => c.kind === 'number' && c.value === 0)).toHaveLength(4);
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE);
  });

  it('stacks +2 on +2, +4 on +4 and +4 on +2, never +2 on +4', () => {
    const [draw2] = buildDeck().filter((c) => c.kind === 'draw2');
    const [wild4] = buildDeck().filter((c) => c.kind === 'wild4');
    expect(canStack(draw2!, 'draw2')).toBe(true);
    expect(canStack(wild4!, 'draw2')).toBe(true);
    expect(canStack(wild4!, 'wild4')).toBe(true);
    expect(canStack(draw2!, 'wild4')).toBe(false);
  });

  it('matches by colour, number or symbol', () => {
    const deck = buildDeck();
    const red5 = deck.find((c) => c.kind === 'number' && c.color === 'red' && c.value === 5)!;
    const blue5 = deck.find((c) => c.kind === 'number' && c.color === 'blue' && c.value === 5)!;
    const blue7 = deck.find((c) => c.kind === 'number' && c.color === 'blue' && c.value === 7)!;
    const redSkip = deck.find((c) => c.kind === 'skip' && c.color === 'red')!;
    const greenSkip = deck.find((c) => c.kind === 'skip' && c.color === 'green')!;
    const pile = { top: red5, color: 'red' as const, pendingDraw: 0, pendingKind: null };
    expect(canPlayOnTurn(blue5, pile)).toBe(true);
    expect(canPlayOnTurn(blue7, pile)).toBe(false);
    expect(canPlayOnTurn(redSkip, pile)).toBe(true);
    expect(canPlayOnTurn(greenSkip, { ...pile, top: redSkip })).toBe(true);
  });
});

describe('dealing', () => {
  it('deals seven cards each and starts on a number card', () => {
    for (let seed = 1; seed < 50; seed++) {
      const r = round(['a', 'b', 'c'], seed);
      expect(r.players.every((p) => p.hand.length === 7)).toBe(true);
      expect(r.top.kind).toBe('number');
      expect(r.color).toBe(r.top.color);
      expect(r.allCards()).toHaveLength(DECK_SIZE);
    }
  });
});

describe('turns', () => {
  it('rejects cards that do not match and plays out of turn only as a jump-in', () => {
    const r = round();
    rig(r, { hands: { a: ['b7', 'r2'], b: ['r9', 'g7'] }, top: 'r5' });
    expect(r.play('a', cardId(r, 'a', 'b7')).ok).toBe(false);
    expect(r.play('b', cardId(r, 'b', 'r9')).ok).toBe(false);
    play(r, 'a', 'r2');
    expect(r.currentPlayer.id).toBe('b');
  });

  it('skips the next player, and with two players goes again', () => {
    const r = round();
    rig(r, { hands: { a: ['rS', 'r1'], b: ['r2'] }, top: 'r5' });
    const events = play(r, 'a', 'rS');
    expect(events).toContainEqual({ type: 'skip', playerId: 'b' });
    expect(r.currentPlayer.id).toBe('c');

    const duo = round(['a', 'b']);
    rig(duo, { hands: { a: ['rS', 'r1'], b: ['r2'] }, top: 'r5' });
    play(duo, 'a', 'rS');
    expect(duo.currentPlayer.id).toBe('a');
  });

  it('reverses direction, and with two players acts like a skip', () => {
    const r = round();
    rig(r, { hands: { b: ['rR', 'r1'] }, top: 'r5' });
    r.current = 1;
    play(r, 'b', 'rR');
    expect(r.direction).toBe(-1);
    expect(r.currentPlayer.id).toBe('a');

    const duo = round(['a', 'b']);
    rig(duo, { hands: { a: ['rR', 'r1'], b: ['r2'] }, top: 'r5' });
    play(duo, 'a', 'rR');
    expect(duo.currentPlayer.id).toBe('a');
  });

  it('draws one card and passes the turn when it cannot be played', () => {
    const r = round();
    rig(r, { hands: { a: ['b7'] }, top: 'r5', drawTop: ['g3'] });
    const result = r.draw('a');
    expect(result.ok && result.events).toContainEqual({ type: 'draw', playerId: 'a', count: 1, penalty: false });
    expect(handSpecs(r, 'a')).toEqual(['b7', 'g3']);
    expect(r.currentPlayer.id).toBe('b');
  });

  it('lets you play or keep a playable drawn card, and nothing else', () => {
    const r = round();
    rig(r, { hands: { a: ['b7', 'r1'] }, top: 'r5', drawTop: ['r3'] });
    r.draw('a');
    expect(r.currentPlayer.id).toBe('a');
    expect(r.drawnCardId).toBe(cardId(r, 'a', 'r3'));
    expect(r.play('a', cardId(r, 'a', 'r1')).ok).toBe(false);
    expect(r.draw('a').ok).toBe(false);
    play(r, 'a', 'r3');
    expect(r.currentPlayer.id).toBe('b');

    const keep = round();
    rig(keep, { hands: { a: ['b7'] }, top: 'r5', drawTop: ['r3'] });
    keep.draw('a');
    expect(keep.pass('a').ok).toBe(true);
    expect(handSpecs(keep, 'a')).toEqual(['b7', 'r3']);
    expect(keep.currentPlayer.id).toBe('b');
  });

  it('reshuffles the discard pile when the draw pile runs out', () => {
    const r = round(['a', 'b']);
    rig(r, { hands: { a: ['b7'], b: ['g1'] }, top: 'r5' });
    const reserve = r.drawPile.splice(0);
    r.discard.unshift(...reserve.slice(0, 10));
    const result = r.draw('a');
    expect(result.ok && result.events.some((e) => e.type === 'reshuffle')).toBe(true);
    expect(r.top).toBeDefined();
    expect(r.allCards()).toHaveLength(DECK_SIZE - reserve.length + 10);
  });
});

describe('draw stacking', () => {
  it('stacks +2s and makes the first player who cannot stack take the lot', () => {
    const r = round();
    rig(r, { hands: { a: ['r+2', 'r1'], b: ['b+2', 'b1'], c: ['g5'] }, top: 'r5' });
    play(r, 'a', 'r+2');
    expect(r.pendingDraw).toBe(2);
    expect(r.play('b', cardId(r, 'b', 'b1')).ok).toBe(false);
    play(r, 'b', 'b+2');
    expect(r.pendingDraw).toBe(4);
    expect(r.currentPlayer.id).toBe('c');
    expect(r.mustTakePenalty).toBe(true);
    const result = r.draw('c');
    expect(result.ok && result.events).toContainEqual({ type: 'draw', playerId: 'c', count: 4, penalty: true });
    expect(r.player('c')!.hand).toHaveLength(5);
    expect(r.pendingDraw).toBe(0);
    expect(r.currentPlayer.id).toBe('d');
  });

  it('escalates a +2 stack with a +4 but never answers a +4 with a +2', () => {
    const r = round();
    rig(r, { hands: { a: ['r+2', 'r1'], b: ['W+4', 'b1'], c: ['g+2', 'W+4', 'g1'] }, top: 'r5' });
    play(r, 'a', 'r+2');
    play(r, 'b', 'W+4');
    r.chooseColor('b', 'green');
    expect(r.pendingDraw).toBe(6);
    expect(r.play('c', cardId(r, 'c', 'g+2')).ok).toBe(false);
    expect(r.mustTakePenalty).toBe(false);
    play(r, 'c', 'W+4');
    r.chooseColor('c', 'blue');
    expect(r.pendingDraw).toBe(10);
    expect(r.currentPlayer.id).toBe('d');
  });
});

describe('wilds', () => {
  it('waits for a colour choice before anything else happens', () => {
    const r = round();
    rig(r, { hands: { a: ['W', 'r1'], b: ['W', 'b1'] }, top: 'r5' });
    play(r, 'a', 'W');
    expect(r.pendingChoice).toEqual({ type: 'color', playerId: 'a' });
    expect(r.play('b', cardId(r, 'b', 'W')).ok).toBe(false);
    expect(r.chooseColor('b', 'blue').ok).toBe(false);
    const result = r.chooseColor('a', 'blue');
    expect(result.ok && result.events).toEqual([{ type: 'color', playerId: 'a', color: 'blue' }]);
    expect(r.color).toBe('blue');
    expect(r.currentPlayer.id).toBe('b');
  });
});

describe('rotate and swap', () => {
  it('passes every hand to the next player in the direction of play', () => {
    const r = round();
    rig(r, { hands: { a: ['r@', 'r1', 'r2'], b: ['b1'], c: ['g1', 'g2'], d: ['y1', 'y2', 'y3'] }, top: 'r5' });
    const events = play(r, 'a', 'r@');
    expect(events).toContainEqual({ type: 'rotate', direction: 1 });
    expect(handSpecs(r, 'b')).toEqual(['r1', 'r2']);
    expect(handSpecs(r, 'c')).toEqual(['b1']);
    expect(handSpecs(r, 'd')).toEqual(['g1', 'g2']);
    expect(handSpecs(r, 'a')).toEqual(['y1', 'y2', 'y3']);
    expect(events).toContainEqual({ type: 'lastCard', playerId: 'c' });
    expect(r.currentPlayer.id).toBe('b');
  });

  it('rotates the other way after a reverse', () => {
    const r = round();
    rig(r, { hands: { a: ['r@', 'r1'], b: ['b1'], c: ['g1'], d: ['y1'] }, top: 'r5' });
    r.direction = -1;
    play(r, 'a', 'r@');
    expect(handSpecs(r, 'd')).toEqual(['r1']);
    expect(handSpecs(r, 'a')).toEqual(['b1']);
    expect(r.currentPlayer.id).toBe('d');
  });

  it('swaps hands with the chosen player', () => {
    const r = round();
    rig(r, { hands: { a: ['b~', 'r1', 'r2'], c: ['g1', 'g2', 'g3', 'g4'] }, top: 'b5' });
    play(r, 'a', 'b~');
    expect(r.pendingChoice).toEqual({ type: 'swap', playerId: 'a' });
    expect(r.chooseSwap('a', 'a').ok).toBe(false);
    const result = r.chooseSwap('a', 'c');
    expect(result.ok && result.events[0]).toEqual({ type: 'swap', playerId: 'a', targetId: 'c' });
    expect(handSpecs(r, 'a')).toEqual(['g1', 'g2', 'g3', 'g4']);
    expect(handSpecs(r, 'c')).toEqual(['r1', 'r2']);
    expect(r.currentPlayer.id).toBe('b');
  });

  it.each(['r@', 'r~', 'W', 'W+4', 'r+2'])('wins on a last %s without its effect', (spec) => {
    const r = round();
    rig(r, { hands: { a: [spec], b: ['b1', 'b2'], c: ['g1'] }, top: 'r5' });
    const events = play(r, 'a', spec);
    expect(events.at(-1)).toEqual({ type: 'win', playerId: 'a' });
    expect(r.winnerId).toBe('a');
    expect(r.pendingChoice).toBeNull();
    expect(r.pendingDraw).toBe(0);
    expect(handSpecs(r, 'b')).toEqual(['b1', 'b2']);
    expect(r.play('b', cardId(r, 'b', 'b1')).ok).toBe(false);
  });

  it('announces a last card when a player is down to one', () => {
    const r = round();
    rig(r, { hands: { a: ['r1', 'r2'] }, top: 'r5' });
    expect(play(r, 'a', 'r1')).toContainEqual({ type: 'lastCard', playerId: 'a' });
  });
});

describe('jump-in', () => {
  it('lets anyone play an identical card out of turn and carries on from them', () => {
    const r = round();
    rig(r, { hands: { a: ['r5', 'r1'], c: ['r5', 'b2'], d: ['g4'] }, top: 'r3' });
    play(r, 'a', 'r5');
    expect(r.currentPlayer.id).toBe('b');
    const events = play(r, 'c', 'r5');
    expect(events[0]).toMatchObject({ type: 'play', playerId: 'c', jumpIn: true });
    expect(r.currentPlayer.id).toBe('d');
  });

  it('does not let you jump in on your own card', () => {
    const r = round();
    rig(r, { hands: { a: ['r5', 'r5', 'r1'] }, top: 'r3' });
    play(r, 'a', 'r5');
    expect(r.play('a', cardId(r, 'a', 'r5')).ok).toBe(false);
  });

  it('adds to a draw stack and moves it past the jumper', () => {
    const r = round();
    rig(r, { hands: { a: ['r+2', 'r1'], c: ['r+2', 'r9'], d: ['g4'] }, top: 'r3' });
    play(r, 'a', 'r+2');
    play(r, 'c', 'r+2');
    expect(r.pendingDraw).toBe(4);
    expect(r.currentPlayer.id).toBe('d');
  });

  it('lets a wild jump in on a wild, and the jumper picks the colour', () => {
    const r = round();
    rig(r, { hands: { a: ['W', 'r1'], c: ['W', 'b2'] }, top: 'r3' });
    play(r, 'a', 'W');
    r.chooseColor('a', 'green');
    play(r, 'c', 'W');
    expect(r.pendingChoice).toEqual({ type: 'color', playerId: 'c' });
    r.chooseColor('c', 'yellow');
    expect(r.color).toBe('yellow');
    expect(r.currentPlayer.id).toBe('d');
  });

  it('clears the current player’s drawn card when someone jumps in', () => {
    const r = round();
    rig(r, { hands: { a: ['b1'], c: ['r3', 'g2'] }, top: 'r3', drawTop: ['r7'] });
    r.draw('a');
    expect(r.drawnCardId).not.toBeNull();
    play(r, 'c', 'r3');
    expect(r.drawnCardId).toBeNull();
    expect(r.currentPlayer.id).toBe('d');
  });
});

describe('timeouts', () => {
  it('picks up a card for an idle player and counts a strike', () => {
    const r = round();
    rig(r, { hands: { a: ['b7'] }, top: 'r5', drawTop: ['r3'] });
    const result = r.timeout()!;
    expect(result).toMatchObject({ playerId: 'a', strike: true });
    // A playable drawn card is kept, not played.
    expect(handSpecs(r, 'a')).toEqual(['b7', 'r3']);
    expect(r.currentPlayer.id).toBe('b');
  });

  it('takes the whole draw stack for an idle player who could have stacked', () => {
    const r = round();
    rig(r, { hands: { a: ['r+2', 'r1'], b: ['b+2', 'b1'] }, top: 'r5' });
    play(r, 'a', 'r+2');
    const result = r.timeout()!;
    expect(result.strike).toBe(true);
    expect(r.player('b')!.hand).toHaveLength(4);
    expect(r.currentPlayer.id).toBe('c');
  });

  it('finishes a pending colour or swap choice at random without a strike', () => {
    const r = round();
    rig(r, { hands: { a: ['W', 'r1'] }, top: 'r5' });
    play(r, 'a', 'W');
    const colour = r.timeout()!;
    expect(colour.strike).toBe(false);
    expect(colour.events[0]).toMatchObject({ type: 'color', playerId: 'a' });
    expect(r.currentPlayer.id).toBe('b');

    const s = round();
    rig(s, { hands: { a: ['r~', 'r1'], b: ['b1', 'b2'], c: ['g1', 'g2'], d: ['y1', 'y2'] }, top: 'r5' });
    play(s, 'a', 'r~');
    const swap = s.timeout()!;
    expect(swap.strike).toBe(false);
    expect(swap.events[0]).toMatchObject({ type: 'swap', playerId: 'a' });
    expect(handSpecs(s, 'a')).not.toEqual(['r1']);
  });

  it('keeps a drawn card without a strike when the player already acted', () => {
    const r = round();
    rig(r, { hands: { a: ['b7'] }, top: 'r5', drawTop: ['r3'] });
    r.draw('a');
    expect(r.timeout()).toMatchObject({ playerId: 'a', strike: false });
    expect(r.currentPlayer.id).toBe('b');
  });
});

describe('joining and leaving', () => {
  it('seats a late joiner to play after everyone else', () => {
    const r = round(['a', 'b', 'c']);
    r.current = 1;
    const events = r.addPlayer('z');
    expect(events).toContainEqual({ type: 'draw', playerId: 'z', count: 7, penalty: false });
    expect(r.players.map((p) => p.id)).toEqual(['a', 'z', 'b', 'c']);
    expect(r.currentPlayer.id).toBe('b');

    const back = round(['a', 'b', 'c']);
    back.current = 1;
    back.direction = -1;
    back.addPlayer('z');
    // b → a → c → z → b
    expect(back.players.map((p) => p.id)).toEqual(['a', 'b', 'z', 'c']);
    expect(back.currentPlayer.id).toBe('b');
  });

  it('restores a returning player’s old hand', () => {
    const r = round(['a', 'b', 'c']);
    const left = r.removePlayer('c')!;
    r.addPlayer('c', left.hand);
    expect(r.player('c')!.hand).toBe(left.hand);
    expect(r.allCards()).toHaveLength(DECK_SIZE);
  });

  it('passes the turn on when the current player leaves', () => {
    const r = round();
    r.current = 1;
    r.removePlayer('b');
    expect(r.currentPlayer.id).toBe('c');

    const back = round();
    back.current = 1;
    back.direction = -1;
    back.removePlayer('b');
    expect(back.currentPlayer.id).toBe('a');

    const last = round();
    last.current = 3;
    last.removePlayer('d');
    expect(last.currentPlayer.id).toBe('a');

    const earlier = round();
    earlier.current = 2;
    earlier.removePlayer('a');
    expect(earlier.currentPlayer.id).toBe('c');
  });

  it('makes a player who leaves while facing a stack take it with them', () => {
    const r = round();
    rig(r, { hands: { a: ['r+2', 'r1'], b: ['b1'] }, top: 'r5' });
    play(r, 'a', 'r+2');
    const left = r.removePlayer('b')!;
    expect(left.hand).toHaveLength(3);
    expect(r.pendingDraw).toBe(0);
    expect(r.currentPlayer.id).toBe('c');
  });

  it('finishes a leaver’s colour choice and cancels their swap', () => {
    const r = round();
    rig(r, { hands: { a: ['W', 'r1'] }, top: 'r5' });
    play(r, 'a', 'W');
    r.removePlayer('a');
    expect(r.pendingChoice).toBeNull();
    expect(r.currentPlayer.id).toBe('b');

    const s = round();
    rig(s, { hands: { b: ['r~', 'r1'] }, top: 'r5' });
    s.current = 1;
    play(s, 'b', 'r~');
    s.removePlayer('b');
    expect(s.pendingChoice).toBeNull();
    expect(s.currentPlayer.id).toBe('c');
  });
});

describe('random play', () => {
  it('never loses a card and always finishes', () => {
    const rng = seeded(42);
    let games = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].slice(0, 2 + (seed % 7));
      const r = new Round(ids, seeded(seed));
      const setAside = new Map<string, Card[]>();
      let steps = 0;
      while (!r.winnerId && steps++ < 5000) {
        const roll = rng();
        if (roll < 0.01 && r.players.length > 2) {
          const leaver = r.players[Math.floor(rng() * r.players.length)]!;
          setAside.set(leaver.id, r.removePlayer(leaver.id)!.hand);
        } else if (roll < 0.02 && setAside.size > 0) {
          const [id, hand] = [...setAside][0]!;
          setAside.delete(id);
          r.addPlayer(id, hand);
        } else if (r.pendingChoice) {
          r.timeout();
        } else if (roll < 0.1) {
          // Somebody tries to jump in.
          const jumper = r.players[Math.floor(rng() * r.players.length)]!;
          const card = jumper.hand.find((c) => specOf(c) === specOf(r.top));
          if (card) r.play(jumper.id, card.id);
        } else {
          const player = r.currentPlayer;
          const playable = player.hand.filter(
            (c) => canPlayOnTurn(c, r.pile) && (r.drawnCardId === null || c.id === r.drawnCardId),
          );
          if (playable.length > 0 && rng() < 0.9) {
            expect(r.play(player.id, playable[Math.floor(rng() * playable.length)]!.id).ok).toBe(true);
          } else if (r.drawnCardId !== null) {
            r.pass(player.id);
          } else {
            expect(r.draw(player.id).ok).toBe(true);
          }
        }
        const cards = [...r.allCards(), ...[...setAside.values()].flat()];
        expect(cards).toHaveLength(DECK_SIZE);
        expect(new Set(cards.map((c) => c.id)).size).toBe(DECK_SIZE);
        expect(r.current).toBeGreaterThanOrEqual(0);
        expect(r.current).toBeLessThan(r.players.length);
      }
      if (r.winnerId) games++;
    }
    expect(games).toBeGreaterThan(250);
  });
});
