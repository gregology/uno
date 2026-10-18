import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { PublicPlayer, TableView } from '../../shared/protocol';
import { anchor } from '../lib/anchors';
import { cls, nextPlayerId, opponentsInOrder } from '../lib/game';

export function TimerRing({ deadline, total }: { deadline: number; total: number }) {
  const remaining = Math.max(0, deadline - Date.now());
  // A CSS animation drains the ring; it restarts (from the right point) when the deadline moves.
  const style = { '--from': 1 - remaining / total, animationDuration: `${remaining}ms` } as CSSProperties;
  return (
    <svg className="timer-ring" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r="27" className="timer-track" />
      <circle key={Math.round(deadline / 500)} cx="30" cy="30" r="27" pathLength={1} className="timer-arc" style={style} />
    </svg>
  );
}

interface BadgeProps {
  player: PublicPlayer;
  current: boolean;
  next: boolean;
  choosing: 'color' | 'swap' | null;
  deadline: number | null;
  total: number;
  maxStrikes: number;
}

function OpponentBadge({ player, current, next, choosing, deadline, total, maxStrikes }: BadgeProps) {
  const lastCard = player.cardCount === 1;
  return (
    <motion.div
      layout
      ref={anchor(`player:${player.id}`)}
      className={cls('badge', current && 'is-current', lastCard && 'is-last', !player.connected && 'is-offline')}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: current ? 1.08 : 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <motion.div
        className="badge-avatar"
        animate={lastCard ? { rotate: [0, -10, 10, -10, 10, 0] } : { rotate: 0 }}
        transition={lastCard ? { duration: 0.6, repeat: Infinity, repeatDelay: 1 } : { duration: 0.2 }}
      >
        {current && deadline !== null && <TimerRing deadline={deadline} total={total} />}
        <span className="avatar-emoji">{player.avatar}</span>
        <motion.span key={player.cardCount} className="badge-count" initial={{ scale: 1.6 }} animate={{ scale: 1 }}>
          {player.cardCount}
        </motion.span>
        {player.wins > 0 && <span className="badge-crowns">👑{player.wins > 1 ? player.wins : ''}</span>}
        {!player.connected && (
          <span className="badge-offline" title="Disconnected">
            📡
          </span>
        )}
      </motion.div>
      <div className="badge-name">{player.name}</div>
      <AnimatePresence>
        {lastCard && (
          <motion.div
            className="badge-alert"
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.18, 1] }}
            // The exit needs its own transition, or it inherits the endless repeat and never finishes.
            exit={{ scale: 0, transition: { duration: 0.2 } }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            1 CARD!
          </motion.div>
        )}
      </AnimatePresence>
      {choosing ? (
        <div className="badge-tag">{choosing === 'color' ? 'picking colour' : 'picking swap'}</div>
      ) : next ? (
        <div className="badge-tag badge-tag-next">next</div>
      ) : player.strikes > 0 ? (
        <div className="badge-tag badge-tag-idle">
          💤 {player.strikes}/{maxStrikes}
        </div>
      ) : null}
    </motion.div>
  );
}

export function Opponents({ view, deadline }: { view: TableView; deadline: number | null }) {
  const players = opponentsInOrder(view);
  const next = nextPlayerId(view);
  const columns = players.length <= 4 ? Math.max(players.length, 1) : Math.ceil(players.length / 2);
  return (
    <section className="opponents" style={{ '--cols': columns } as CSSProperties} aria-label="Other players">
      <AnimatePresence initial={false}>
        {players.map((player) => (
          <OpponentBadge
            key={player.id}
            player={player}
            current={player.id === view.currentPlayerId}
            next={player.id === next}
            choosing={view.pendingChoice?.playerId === player.id ? view.pendingChoice.type : null}
            deadline={deadline}
            total={view.turnMsTotal}
            maxStrikes={view.maxStrikes}
          />
        ))}
      </AnimatePresence>
      {players.length === 0 && <div className="opponents-empty">Nobody else is here yet</div>}
    </section>
  );
}
