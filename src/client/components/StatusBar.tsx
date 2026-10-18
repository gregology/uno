import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import type { TableView } from '../../shared/protocol';
import { cls, isMyTurn, isSeated, playerName, useSecondsLeft } from '../lib/game';
import { sfx } from '../lib/sound';

function statusText(view: TableView): string {
  const me = view.me;
  const seated = isSeated(view);
  if (!seated && me?.status === 'waiting') return 'Watching the game';
  // The lobby in the middle of the table already says what's happening.
  if (view.phase === 'waiting') return '';
  if (view.phase === 'countdown') return 'Get ready…';
  if (view.phase === 'ended') {
    return view.winnerId === me?.id ? 'You won! 🎉' : `${playerName(view, view.winnerId)} won!`;
  }
  if (!seated) return "You'll be dealt in shortly";
  const choice = view.pendingChoice;
  if (choice) {
    if (choice.playerId === me?.id) return choice.type === 'color' ? 'Pick a colour' : 'Pick someone to swap hands with';
    const who = playerName(view, choice.playerId);
    return choice.type === 'color' ? `${who} is picking a colour…` : `${who} is picking who to swap with…`;
  }
  if (isMyTurn(view)) {
    if (view.pendingDraw > 0) return `Stack a draw card or take ${view.pendingDraw}!`;
    if (me?.drawnCardId !== null) return 'Play the card you drew, or keep it';
    return 'Your turn!';
  }
  const current = playerName(view, view.currentPlayerId);
  return view.pendingDraw > 0 ? `${current} must stack or take ${view.pendingDraw}` : `${current}'s turn`;
}

export function StatusBar({ view, deadline }: { view: TableView; deadline: number | null }) {
  const text = statusText(view);
  const mine =
    view.phase === 'playing' &&
    (isMyTurn(view) || (view.pendingChoice !== null && view.pendingChoice.playerId === view.me?.id));
  const seconds = useSecondsLeft(mine ? deadline : null);
  const urgent = mine && seconds !== null && seconds <= 5;

  useEffect(() => {
    if (urgent && seconds! > 0) sfx.tick();
  }, [urgent, seconds]);

  const remaining = deadline !== null ? Math.max(0, deadline - Date.now()) : 0;
  return (
    <div className={cls('status', mine && 'is-mine', urgent && 'is-urgent')} aria-live="polite">
      <div className="status-row">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={text}
            className="status-text"
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.span>
        </AnimatePresence>
        {mine && seconds !== null && <span className="status-seconds">{seconds}s</span>}
      </div>
      {mine && deadline !== null && (
        <div className="status-bar">
          <motion.div
            key={Math.round(deadline / 500)}
            className="status-bar-fill"
            initial={{ scaleX: remaining / view.turnMsTotal }}
            animate={{ scaleX: 0 }}
            transition={{ duration: remaining / 1000, ease: 'linear' }}
          />
        </div>
      )}
    </div>
  );
}
