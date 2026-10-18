import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { Card } from '../../shared/cards';
import type { TableView } from '../../shared/protocol';
import { anchor } from '../lib/anchors';
import { discardEntries, toast } from '../lib/fx';
import { cls, useSecondsLeft } from '../lib/game';
import { CardBack, CardFace, COLOR_HEX, COLOR_NAMES, ColorShape } from './Card';

/** A stable, slightly random tilt per card so the pile looks tossed. */
export function tilt(card: Card): number {
  return ((card.id * 47) % 25) - 12;
}

function DiscardTop({ card }: { card: Card }) {
  const entry = discardEntries.get(card.id);
  return (
    <motion.div
      className="discard-card discard-top"
      initial={entry ? { x: entry.x, y: entry.y, scale: entry.scale, rotate: entry.rotate } : { scale: 1.3, opacity: 0 }}
      animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: tilt(card) }}
      transition={{ type: 'spring', stiffness: 280, damping: 22, mass: 0.8 }}
    >
      <CardFace card={card} />
    </motion.div>
  );
}

function DirectionRing({ view }: { view: TableView }) {
  const glow = view.color ? COLOR_HEX[view.color] : 'rgba(255,255,255,0.4)';
  return (
    <motion.div
      className={cls('direction-ring', view.phase !== 'playing' && 'is-idle')}
      style={{ '--glow': glow } as CSSProperties}
      animate={{ scaleX: view.direction }}
      transition={{ type: 'spring', stiffness: 120, damping: 14 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="92" className="ring-line" />
        {[0, 90, 180, 270].map((angle) => (
          <path key={angle} d="M 92 4 L 106 8 L 92 13 Z" className="ring-arrow" transform={`rotate(${angle} 100 100)`} />
        ))}
      </svg>
    </motion.div>
  );
}

function Lobby({ view, phaseDeadline, onInvite }: { view: TableView; phaseDeadline: number | null; onInvite: () => void }) {
  const countdown = useSecondsLeft(view.phase === 'countdown' ? phaseDeadline : null);
  if (view.phase === 'countdown' && countdown !== null) {
    return (
      <div className="lobby">
        <div className="lobby-label">Game starts in</div>
        <AnimatePresence mode="popLayout">
          <motion.div
            key={countdown}
            className="countdown"
            initial={{ scale: 2.4, opacity: 0, rotate: -20 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
          >
            {countdown}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }
  return (
    <div className="lobby">
      <motion.div className="lobby-cards" animate={{ rotate: [0, 4, -4, 0] }} transition={{ duration: 3, repeat: Infinity }}>
        <span className="lobby-card" style={{ transform: 'rotate(-14deg)' }}>
          <CardBack />
        </span>
        <span className="lobby-card" style={{ transform: 'rotate(10deg) translateY(-6px)' }}>
          <CardBack />
        </span>
      </motion.div>
      <div className="lobby-label">Waiting for another player…</div>
      <button type="button" className="btn btn-ghost" onClick={onInvite}>
        Invite friends
      </button>
    </div>
  );
}

interface CenterProps {
  view: TableView;
  phaseDeadline: number | null;
  canDraw: boolean;
  onDraw: () => void;
}

export function CenterTable({ view, phaseDeadline, canDraw, onDraw }: CenterProps) {
  const { topCard, discardUnder, color, pendingDraw } = view;
  const showPiles = topCard !== null && (view.phase === 'playing' || view.phase === 'ended');

  const invite = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) await navigator.share({ title: 'UNO!', text: 'Come and play UNO with me!', url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied. Send it to your friends!');
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <section className="center">
      <DirectionRing view={view} />
      {showPiles ? (
        <div className="piles">
          <motion.button
            type="button"
            ref={anchor('deck')}
            className={cls('draw-pile', canDraw && 'is-active')}
            onClick={onDraw}
            disabled={!canDraw}
            whileTap={canDraw ? { scale: 0.92 } : undefined}
            aria-label={pendingDraw > 0 ? `Pick up ${pendingDraw} cards` : 'Draw a card'}
          >
            <span className="pile-card pile-card-3">
              <CardBack />
            </span>
            <span className="pile-card pile-card-2">
              <CardBack />
            </span>
            <span className="pile-card">
              <CardBack />
            </span>
            {canDraw ? (
              <motion.span
                className="draw-hint"
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              >
                {pendingDraw > 0 ? `Take ${pendingDraw}` : 'Draw'}
              </motion.span>
            ) : (
              <span className="pile-count">{view.drawPileCount}</span>
            )}
          </motion.button>

          <div className="discard" ref={anchor('discard')}>
            <div
              className="discard-glow"
              style={{ '--glow': color ? COLOR_HEX[color] : 'transparent' } as CSSProperties}
            />
            {discardUnder.map((card) => (
              <div key={card.id} className="discard-card" style={{ transform: `rotate(${tilt(card)}deg)` }}>
                <CardFace card={card} />
              </div>
            ))}
            <DiscardTop key={`${view.roundId}-${topCard.id}`} card={topCard} />
            <AnimatePresence>
              {color && topCard.color === null && (
                <motion.div
                  key={color}
                  className="color-chip"
                  style={{ background: COLOR_HEX[color] }}
                  initial={{ scale: 0, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0 }}
                >
                  <svg viewBox="-8 -8 16 16" width="14" height="14" aria-hidden="true">
                    <ColorShape color={color} size={11} />
                  </svg>
                  {COLOR_NAMES[color]}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        <Lobby view={view} phaseDeadline={phaseDeadline} onInvite={invite} />
      )}

      <AnimatePresence>
        {pendingDraw > 0 && view.phase === 'playing' && (
          <motion.div
            className="stack-badge"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: -8 }}
            exit={{ scale: 0, rotate: 30 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <motion.span key={pendingDraw} initial={{ scale: 1.9 }} animate={{ scale: 1 }}>
              +{pendingDraw}
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
