import { motion } from 'motion/react';
import { COLORS, type Color } from '../../shared/cards';
import type { TableView } from '../../shared/protocol';
import { opponentsInOrder } from '../lib/game';
import { COLOR_HEX, COLOR_NAMES, ColorShape } from './Card';
import { Sheet } from './Sheet';

export function ColorPicker({ onPick }: { onPick: (color: Color) => void }) {
  return (
    <Sheet title="Pick a colour" className="picker">
      <div className="color-grid">
        {COLORS.map((color, i) => (
          <motion.button
            key={color}
            type="button"
            className="color-btn"
            style={{ background: COLOR_HEX[color] }}
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0, transition: { delay: 0.05 * i, type: 'spring', stiffness: 400, damping: 16 } }}
            whileTap={{ scale: 0.88 }}
            onClick={() => onPick(color)}
          >
            <svg viewBox="-12 -12 24 24" width="30" height="30" aria-hidden="true">
              <ColorShape color={color} size={18} />
            </svg>
            <span>{COLOR_NAMES[color]}</span>
          </motion.button>
        ))}
      </div>
    </Sheet>
  );
}

export function SwapPicker({ view, onPick }: { view: TableView; onPick: (playerId: string) => void }) {
  const others = [...opponentsInOrder(view)].sort((a, b) => a.cardCount - b.cardCount);
  return (
    <Sheet title="Swap hands with…" className="picker">
      <div className="swap-list">
        {others.map((player, i) => (
          <motion.button
            key={player.id}
            type="button"
            className="swap-btn"
            initial={{ x: -40, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { delay: 0.04 * i } }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onPick(player.id)}
          >
            <span className="swap-avatar">{player.avatar}</span>
            <span className="swap-name">{player.name}</span>
            <span className="swap-count">
              {player.cardCount} {player.cardCount === 1 ? 'card' : 'cards'}
            </span>
          </motion.button>
        ))}
      </div>
    </Sheet>
  );
}
