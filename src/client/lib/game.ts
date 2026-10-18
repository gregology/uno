import { useEffect, useReducer } from 'react';
import { canJumpIn, canPlayOnTurn, type PileState } from '../../shared/cards';
import type { PublicPlayer, TableView } from '../../shared/protocol';

export function pileOf(view: TableView): PileState | null {
  if (!view.topCard || !view.color) return null;
  return { top: view.topCard, color: view.color, pendingDraw: view.pendingDraw, pendingKind: view.pendingKind };
}

export function isSeated(view: TableView): boolean {
  return view.me?.status === 'seated' && view.players.some((p) => p.id === view.me!.id);
}

export function isMyTurn(view: TableView): boolean {
  return (
    view.phase === 'playing' &&
    !!view.me &&
    view.currentPlayerId === view.me.id &&
    !view.pendingChoice
  );
}

/** Cards you could play right now on your turn. */
export function playableIds(view: TableView): Set<number> {
  const pile = pileOf(view);
  const me = view.me;
  if (!pile || !me || !isMyTurn(view)) return new Set();
  return new Set(
    me.hand
      .filter((card) => (me.drawnCardId === null || card.id === me.drawnCardId) && canPlayOnTurn(card, pile))
      .map((card) => card.id),
  );
}

/** Cards you could jump in with while it's someone else's turn. */
export function jumpableIds(view: TableView): Set<number> {
  const pile = pileOf(view);
  const me = view.me;
  if (!pile || !me || view.phase !== 'playing' || view.pendingChoice || isMyTurn(view)) return new Set();
  if (!isSeated(view) || view.topPlayedBy === me.id) return new Set();
  return new Set(me.hand.filter((card) => canJumpIn(card, pile)).map((card) => card.id));
}

export function canDraw(view: TableView): boolean {
  return isMyTurn(view) && (view.pendingDraw > 0 || view.me!.drawnCardId === null);
}

/** Everyone else, starting with the player after you, so the row reads in turn order. */
export function opponentsInOrder(view: TableView): PublicPlayer[] {
  const myIndex = view.players.findIndex((p) => p.id === view.me?.id);
  if (myIndex < 0) return view.players;
  return [...view.players.slice(myIndex + 1), ...view.players.slice(0, myIndex)];
}

export function nextPlayerId(view: TableView): string | null {
  if (view.phase !== 'playing' || !view.currentPlayerId) return null;
  const index = view.players.findIndex((p) => p.id === view.currentPlayerId);
  if (index < 0) return null;
  const count = view.players.length;
  return view.players[(index + view.direction + count) % count]?.id ?? null;
}

export function playerName(view: TableView, id: string | null): string {
  if (!id) return '';
  if (id === view.me?.id) return 'You';
  return view.players.find((p) => p.id === id)?.name ?? 'Someone';
}

/** Seconds left until a local deadline, re-rendering a few times a second. */
export function useSecondsLeft(deadline: number | null): number | null {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (deadline === null) return;
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}
