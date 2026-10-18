import confetti from 'canvas-confetti';
import type { Card, Color } from '../../shared/cards';
import type { GameEvent, TableView } from '../../shared/protocol';
import { boxOf, type Box } from './anchors';
import { sfx } from './sound';
import { createStore } from './store';

export type Effect =
  | { id: number; kind: 'flight'; from: Box; to: Box; card: Card | null; delay: number; small: boolean }
  | { id: number; kind: 'float'; at: Box; emoji: string; drift: number }
  | { id: number; kind: 'stamp'; at: Box; text: string; tone: 'skip' | 'hit' | 'reverse' }
  | { id: number; kind: 'splash'; at: Box; color: Color };

type NewEffect = Effect extends infer E ? (E extends Effect ? Omit<E, 'id'> : never) : never;

export type BannerTone = 'jump' | 'last' | 'hit' | 'rotate' | 'swap' | 'skip' | 'info';

export interface Banner {
  id: number;
  title: string;
  subtitle?: string;
  tone: BannerTone;
}

export interface Toast {
  id: number;
  text: string;
}

export interface FxState {
  effects: Effect[];
  banner: Banner | null;
  toasts: Toast[];
  /** Bumped when your whole hand is replaced (Rotate, Swap) so it can slide away and back. */
  handVersion: number;
  /** Bumped to shake the screen when a big penalty lands on you. */
  shake: number;
}

export const fx = createStore<FxState>({ effects: [], banner: null, toasts: [], handVersion: 0, shake: 0 });

/** Where each newly played card should fly onto the discard pile from, relative to the pile. */
export const discardEntries = new Map<number, { x: number; y: number; scale: number; rotate: number }>();

const BANNER_PRIORITY: Record<BannerTone, number> = {
  info: 0,
  skip: 1,
  jump: 2,
  hit: 3,
  rotate: 4,
  swap: 4,
  last: 5,
};

let nextId = 1;
let bannerShownAt = 0;

function addEffect(effect: NewEffect, lifetimeMs = 1600): void {
  const id = nextId++;
  fx.set((s) => ({ ...s, effects: [...s.effects, { ...effect, id } as Effect] }));
  setTimeout(() => fx.set((s) => ({ ...s, effects: s.effects.filter((e) => e.id !== id) })), lifetimeMs);
}

function showBanner(banner: Omit<Banner, 'id'>, ms = 1800): void {
  const current = fx.get().banner;
  // Don't let a minor banner trample a more important one that has only just appeared.
  if (current && Date.now() - bannerShownAt < 700 && BANNER_PRIORITY[current.tone] > BANNER_PRIORITY[banner.tone]) return;
  const id = nextId++;
  bannerShownAt = Date.now();
  fx.set((s) => ({ ...s, banner: { ...banner, id } }));
  setTimeout(() => fx.set((s) => (s.banner?.id === id ? { ...s, banner: null } : s)), ms);
}

export function toast(text: string, ms = 2800): void {
  const id = nextId++;
  fx.set((s) => ({ ...s, toasts: [...s.toasts.slice(-2), { id, text }] }));
  setTimeout(() => fx.set((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

function fly(from: Box | null, to: Box | null, count: number, options: { small: boolean; stagger?: number; delay?: number }): void {
  if (!from || !to) return;
  for (let i = 0; i < count; i++) {
    addEffect(
      { kind: 'flight', from, to, card: null, delay: (options.delay ?? 0) + i * (options.stagger ?? 0.07), small: options.small },
      1400 + i * 80,
    );
  }
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function celebrate(): void {
  if (reducedMotion()) return;
  const colors = ['#ef3d3d', '#ffc61a', '#22b35c', '#2479ea', '#ffffff'];
  void confetti({ particleCount: 150, spread: 100, startVelocity: 45, origin: { y: 0.55 }, colors });
  setTimeout(() => void confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.85 }, colors }), 250);
  setTimeout(() => void confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.85 }, colors }), 450);
}

/**
 * Turn the server's events into animations and sounds. Runs before the new view
 * renders, so element positions still reflect the previous state.
 */
export function handleEvents(events: GameEvent[], prev: TableView | null, next: TableView): void {
  const me = next.me ?? prev?.me ?? null;
  const meId = me?.id ?? null;
  const seated = next.me?.status === 'seated' || prev?.me?.status === 'seated';
  const people = new Map([...(prev?.players ?? []), ...next.players, ...next.spectators].map((p) => [p.id, p.name]));
  const name = (id: string) => (id === meId ? 'You' : (people.get(id) ?? 'Someone'));
  const box = (id: string) => (id === meId && seated ? boxOf('hand') : boxOf(`player:${id}`));

  for (const event of events) {
    switch (event.type) {
      case 'play': {
        const target = boxOf('discard');
        const mine = event.playerId === meId;
        const from = (mine && boxOf(`card:${event.card.id}`)) || box(event.playerId);
        if (target && from) {
          // Only the last few matter; keep the map from growing all session.
          if (discardEntries.size > 24) discardEntries.delete(discardEntries.keys().next().value!);
          discardEntries.set(event.card.id, {
            x: from.x - target.x,
            y: from.y - target.y,
            scale: Math.min(1, Math.max(0.3, from.width / target.width)),
            rotate: mine ? 0 : -40,
          });
        }
        sfx.play();
        if (event.jumpIn) {
          sfx.jump();
          showBanner({ title: 'JUMP-IN!', subtitle: `${name(event.playerId)} jumped in`, tone: 'jump' });
        }
        break;
      }
      case 'draw': {
        const to = box(event.playerId);
        fly(boxOf('deck'), to, Math.min(event.count, 8), { small: event.playerId !== meId });
        if (event.count > 0) sfx.draw();
        if (event.penalty && event.count > 0) {
          sfx.hit();
          if (to) addEffect({ kind: 'stamp', at: to, text: `+${event.count}`, tone: 'hit' });
          if (event.playerId === meId) {
            fx.set((s) => ({ ...s, shake: s.shake + 1 }));
            showBanner({ title: `+${event.count}`, subtitle: 'Ouch! You picked up the stack', tone: 'hit' });
          } else if (event.count >= 6) {
            showBanner({ title: `+${event.count}`, subtitle: `${name(event.playerId)} picks up the lot`, tone: 'hit' });
          }
        }
        break;
      }
      case 'skip': {
        const at = box(event.playerId);
        if (at) addEffect({ kind: 'stamp', at, text: '🚫', tone: 'skip' });
        sfx.skip();
        if (event.playerId === meId) showBanner({ title: 'Skipped!', tone: 'skip' });
        break;
      }
      case 'reverse': {
        const at = boxOf('discard');
        if (at) addEffect({ kind: 'stamp', at, text: '🔁', tone: 'reverse' });
        sfx.reverse();
        break;
      }
      case 'color': {
        const at = boxOf('discard');
        if (at) addEffect({ kind: 'splash', at, color: event.color }, 1200);
        sfx.color();
        break;
      }
      case 'rotate': {
        const order = next.players.map((p) => p.id);
        order.forEach((id, i) => {
          const to = order[(i + event.direction + order.length) % order.length]!;
          fly(box(id), box(to), 3, { small: true, stagger: 0.05, delay: 0.1 });
        });
        if (seated) fx.set((s) => ({ ...s, handVersion: s.handVersion + 1 }));
        sfx.whoosh();
        showBanner({ title: 'Rotate!', subtitle: 'Every hand moves on', tone: 'rotate' });
        break;
      }
      case 'swap': {
        fly(box(event.playerId), box(event.targetId), 3, { small: true, stagger: 0.05 });
        fly(box(event.targetId), box(event.playerId), 3, { small: true, stagger: 0.05 });
        if (event.playerId === meId || event.targetId === meId) fx.set((s) => ({ ...s, handVersion: s.handVersion + 1 }));
        sfx.whoosh();
        showBanner({ title: 'Swap!', subtitle: `${name(event.playerId)} ⇄ ${name(event.targetId)}`, tone: 'swap' });
        break;
      }
      case 'lastCard': {
        sfx.lastCard();
        showBanner(
          event.playerId === meId
            ? { title: 'Last card!', subtitle: 'One more and you win', tone: 'last' }
            : { title: 'ONE CARD LEFT!', subtitle: `${name(event.playerId)} is about to win`, tone: 'last' },
          2200,
        );
        break;
      }
      case 'win':
        sfx.win();
        celebrate();
        break;
      case 'timeout':
        if (event.playerId === meId) {
          toast(`Time's up! A card was picked up for you (${event.strikes}/${next.maxStrikes})`);
        }
        break;
      case 'joined':
        if (event.playerId !== meId) toast(`${name(event.playerId)} joined${event.midGame ? ' the game' : ''}`);
        break;
      case 'left':
        if (event.playerId !== meId) {
          toast(event.reason === 'afk' ? `${name(event.playerId)} was removed for being idle` : `${name(event.playerId)} left`);
        }
        break;
      case 'roundStart': {
        discardEntries.clear();
        const deck = boxOf('deck');
        next.players.forEach((p, i) => fly(deck, box(p.id), 3, { small: p.id !== meId, stagger: 0.12, delay: i * 0.05 }));
        sfx.deal();
        showBanner({ title: 'New game!', subtitle: 'Seats have been shuffled', tone: 'info' });
        break;
      }
      case 'reshuffle':
        toast('Shuffling the discard pile into the deck');
        break;
      case 'roundAbandoned':
        toast('Not enough players. Waiting for more…');
        break;
      case 'reaction': {
        const at = box(event.playerId) ?? boxOf('reactions');
        if (at) addEffect({ kind: 'float', at, emoji: event.emoji, drift: Math.random() * 80 - 40 }, 2200);
        sfx.pop();
        break;
      }
      case 'pass':
        break;
    }
  }

  if (meId && next.phase === 'playing' && next.currentPlayerId === meId && prev?.currentPlayerId !== meId) {
    sfx.turn();
  }
}
