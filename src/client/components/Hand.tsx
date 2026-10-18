import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardLabel, type Card } from '../../shared/cards';
import { anchor } from '../lib/anchors';
import { fx } from '../lib/fx';
import { cls } from '../lib/game';
import { sfx } from '../lib/sound';
import { useStore } from '../lib/store';
import { CardFace } from './Card';

interface HandProps {
  cards: Card[];
  roundId: number;
  playable: Set<number>;
  jumpable: Set<number>;
  drawnCardId: number | null;
  myTurn: boolean;
  /** Shown when the hand is empty, e.g. for someone who sat down between games. */
  emptyText: string | null;
  onPlay: (card: Card) => void;
}

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

interface LayoutProps extends HandProps {
  width: number;
  /** Deal the first cards in one by one (false when the whole hand slides in instead). */
  dealOnMount: boolean;
}

function HandCards({ cards, roundId, playable, jumpable, drawnCardId, myTurn, onPlay, width, dealOnMount }: LayoutProps) {
  const seen = useRef<{ roundId: number; ids: Set<number> } | null>(null);
  if (seen.current === null) {
    seen.current = { roundId, ids: new Set(dealOnMount ? [] : cards.map((c) => c.id)) };
  } else if (seen.current.roundId !== roundId) {
    seen.current = { roundId, ids: new Set() };
  }
  const known = seen.current.ids;
  useEffect(() => {
    for (const card of cards) known.add(card.id);
  });

  const [nope, setNope] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const cardWidth = Math.round(Math.min(92, Math.max(56, width * 0.19)));
  const cardHeight = cardWidth * 1.5;
  const count = cards.length;
  const middle = (count - 1) / 2;
  // Fan angle per card, capped so the outermost cards tilt at most 14 degrees.
  const fanAngle = count > 1 ? Math.min(5, 14 / middle) : 0;
  // Tilted cards pivot below their centre, so their top corners swing outwards; keep that on screen.
  const tiltMargin = 6 + cardHeight * 1.1 * Math.sin((fanAngle * middle * Math.PI) / 180);
  const fit = count > 1 ? (width - cardWidth - 2 * tiltMargin) / (count - 1) : 0;
  const scroll = count > 1 && fit < cardWidth * 0.42;
  const step = scroll ? cardWidth * 0.5 : Math.min(cardWidth * 0.8, fit);
  const span = cardWidth + step * Math.max(0, count - 1);
  const start = scroll ? 10 : (width - span) / 2;
  const fan = scroll ? 0 : fanAngle;

  // Bring the card you just drew into view when the hand scrolls. Deliberately runs only when a
  // card is drawn, not on every layout change, so it never fights the player's own scrolling.
  useEffect(() => {
    if (!scroll || drawnCardId === null || !scroller.current) return;
    const index = cards.findIndex((c) => c.id === drawnCardId);
    if (index >= 0) scroller.current.scrollTo({ left: start + index * step - width / 2 + cardWidth / 2, behavior: 'smooth' });
  }, [drawnCardId, scroll]);

  let fresh = 0;
  return (
    <div ref={scroller} className={cls('hand', scroll && 'is-scroll')} style={{ height: cardWidth * 1.5 + 30 }}>
      <div className="hand-track" style={{ width: scroll ? span + 20 : '100%' }}>
        {cards.map((card, i) => {
          const offset = i - middle;
          const isPlayable = playable.has(card.id);
          const isJump = jumpable.has(card.id);
          const lift = isPlayable || isJump ? -18 : 0;
          const isNew = !known.has(card.id);
          const delay = isNew ? fresh++ * 0.07 : 0;
          return (
            <motion.button
              key={card.id}
              type="button"
              ref={anchor(`card:${card.id}`)}
              className={cls(
                'hand-card',
                isPlayable && 'is-playable',
                isJump && 'is-jump',
                myTurn && !isPlayable && 'is-dim',
                card.id === drawnCardId && 'is-drawn',
                nope === card.id && 'is-nope',
              )}
              style={{ width: cardWidth, zIndex: i + 1 }}
              initial={isNew ? { x: start + i * step, y: -140, scale: 0.4, opacity: 0, rotate: -30 } : false}
              animate={{
                x: start + i * step,
                y: (scroll ? 0 : offset * offset * fan * 0.35) + lift,
                rotate: offset * fan,
                scale: 1,
                opacity: 1,
              }}
              transition={{ type: 'spring', stiffness: 360, damping: 28, delay }}
              whileTap={{ scale: 0.93 }}
              aria-label={`${cardLabel(card)}${isPlayable ? ', playable' : isJump ? ', jump in' : ''}`}
              onClick={() => {
                if (isPlayable || isJump) {
                  onPlay(card);
                } else {
                  sfx.nope();
                  setNope(card.id);
                  setTimeout(() => setNope((n) => (n === card.id ? null : n)), 350);
                }
              }}
            >
              <CardFace card={card} />
              {isJump && <span className="jump-tag">⚡ JUMP IN</span>}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export function Hand(props: HandProps) {
  const { handVersion } = useStore(fx);
  const firstVersion = useRef(handVersion);
  const zone = useRef<HTMLDivElement>(null);
  const width = useWidth(zone);
  return (
    <div className="hand-zone" ref={zone}>
      <div className="hand-anchor" ref={anchor('hand')} />
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={handVersion}
          className="hand-slider"
          initial={{ y: -240, scale: 0.35, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: -240, scale: 0.35, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 190, damping: 22 }}
        >
          {width > 0 && <HandCards {...props} width={width} dealOnMount={handVersion === firstVersion.current} />}
        </motion.div>
      </AnimatePresence>
      {props.cards.length === 0 && props.emptyText && <div className="hand-empty">{props.emptyText}</div>}
    </div>
  );
}
