import { motion } from 'motion/react';
import type { Color } from '../../shared/cards';
import { COLOR_HEX } from './Card';

const LETTERS: [string, Color][] = [
  ['U', 'red'],
  ['N', 'yellow'],
  ['O', 'green'],
  ['!', 'blue'],
];

export function Logo({ big = false }: { big?: boolean }) {
  return (
    <div className={big ? 'logo logo-big' : 'logo'} role="img" aria-label="UNO!">
      {LETTERS.map(([letter, color], i) => (
        <motion.span
          key={letter}
          style={{ color: COLOR_HEX[color] }}
          animate={big ? { y: [0, -14, 0], rotate: [0, i % 2 ? 6 : -6, 0] } : undefined}
          transition={big ? { duration: 1.4, repeat: Infinity, delay: i * 0.12, ease: 'easeInOut' } : undefined}
        >
          {letter}
        </motion.span>
      ))}
    </div>
  );
}
