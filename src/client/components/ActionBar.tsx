import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { REACTIONS, type TableView } from '../../shared/protocol';
import { anchor } from '../lib/anchors';
import { send } from '../lib/connection';
import { cls, isMyTurn, isSeated } from '../lib/game';

interface ActionBarProps {
  view: TableView;
  onDraw: () => void;
  onPass: () => void;
}

export function ActionBar({ view, onDraw, onPass }: ActionBarProps) {
  const [open, setOpen] = useState(false);
  const me = view.me!;
  const player = view.players.find((p) => p.id === me.id);
  const myTurn = isMyTurn(view);

  let action: { label: string; onClick: () => void; tone: string } | null = null;
  if (myTurn && view.pendingDraw > 0) action = { label: `Take ${view.pendingDraw}`, onClick: onDraw, tone: 'btn-danger' };
  else if (myTurn && me.drawnCardId !== null) action = { label: 'Keep it', onClick: onPass, tone: 'btn-ghost' };

  return (
    <footer className="action-bar">
      <div className={cls('me-chip', myTurn && 'is-current')}>
        <span className="me-avatar">{me.avatar}</span>
        <span className="me-name">{me.name}</span>
        {player && player.wins > 0 && <span className="me-crowns">👑{player.wins}</span>}
        {player && player.strikes > 0 && (
          <span className="me-idle" title="Automatic turns in a row">
            💤{player.strikes}/{view.maxStrikes}
          </span>
        )}
      </div>

      <div className="action-slot">
        <AnimatePresence mode="popLayout">
          {action && isSeated(view) && (
            <motion.button
              key={action.label}
              type="button"
              className={cls('btn', action.tone)}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileTap={{ scale: 0.92 }}
              onClick={action.onClick}
            >
              {action.label}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <div className="reactions" ref={anchor('reactions')}>
        <AnimatePresence>
          {open && (
            <motion.div
              className="reaction-tray"
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.8 }}
            >
              {REACTIONS.map((emoji, i) => (
                <motion.button
                  key={emoji}
                  type="button"
                  className="reaction-btn"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, transition: { delay: i * 0.03 } }}
                  whileTap={{ scale: 1.4 }}
                  onClick={() => {
                    void send('react', { emoji });
                    setOpen(false);
                  }}
                >
                  {emoji}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          className={cls('icon-btn', 'reaction-toggle', open && 'is-open')}
          aria-label="Send a reaction"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          😀
        </button>
      </div>
    </footer>
  );
}
