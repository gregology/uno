import { AnimatePresence, motion } from 'motion/react';
import type { Effect } from '../lib/fx';
import { fx } from '../lib/fx';
import { useStore } from '../lib/store';
import { CardBack, COLOR_HEX } from './Card';

function Flight({ effect }: { effect: Extract<Effect, { kind: 'flight' }> }) {
  const width = effect.small ? 26 : 52;
  const height = width * 1.5;
  const { from, to } = effect;
  const lift = Math.min(from.y, to.y) - 50;
  return (
    <motion.div
      className="fx-flight"
      style={{ width, height }}
      initial={{ x: from.x - width / 2, y: from.y - height / 2, rotate: 0, opacity: 0 }}
      animate={{
        x: [from.x - width / 2, (from.x + to.x) / 2 - width / 2, to.x - width / 2, to.x - width / 2],
        y: [from.y - height / 2, lift - height / 2, to.y - height / 2, to.y - height / 2],
        rotate: [0, 160, 360, 360],
        opacity: [1, 1, 1, 0],
      }}
      transition={{ duration: 0.65, delay: effect.delay, ease: 'easeInOut', times: [0, 0.45, 0.85, 1] }}
    >
      <CardBack />
    </motion.div>
  );
}

function renderEffect(effect: Effect) {
  switch (effect.kind) {
    case 'flight':
      return <Flight key={effect.id} effect={effect} />;
    case 'float': {
      // Reactions from the badges at the top drift down into the table instead of off the screen.
      const rise = effect.at.y < 240 ? 150 : -170;
      return (
        <motion.div
          key={effect.id}
          className="fx-float"
          initial={{ x: effect.at.x - 24, y: effect.at.y - 24, scale: 0.3, opacity: 0 }}
          animate={{
            x: effect.at.x - 24 + effect.drift,
            y: effect.at.y - 24 + rise,
            scale: [0.3, 1.7, 1.3],
            opacity: [0, 1, 1, 0],
            rotate: [0, -15, 15, 0],
          }}
          transition={{ duration: 2.1, ease: 'easeOut' }}
        >
          {effect.emoji}
        </motion.div>
      );
    }
    case 'stamp':
      return (
        <motion.div
          key={effect.id}
          className={`fx-stamp fx-stamp-${effect.tone}`}
          style={{ left: effect.at.x, top: effect.at.y }}
          initial={{ scale: 3, opacity: 0, rotate: -25, x: '-50%', y: '-50%' }}
          animate={{ scale: [3, 1, 1, 1.2], opacity: [0, 1, 1, 0], rotate: -10, x: '-50%', y: '-50%' }}
          transition={{ duration: 1.3, times: [0, 0.2, 0.75, 1] }}
        >
          {effect.text}
        </motion.div>
      );
    case 'splash':
      return (
        <motion.div
          key={effect.id}
          className="fx-splash"
          style={{ left: effect.at.x, top: effect.at.y, background: COLOR_HEX[effect.color] }}
          initial={{ scale: 0, opacity: 0.8, x: '-50%', y: '-50%' }}
          animate={{ scale: 9, opacity: 0, x: '-50%', y: '-50%' }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      );
  }
}

export function FxLayer() {
  const { effects, banner, toasts } = useStore(fx);
  return (
    <div className="fx-layer" aria-hidden="true">
      {effects.map(renderEffect)}

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.id}
            className={`fx-banner fx-banner-${banner.tone}`}
            initial={{ scale: 0.2, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: -4 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          >
            <div className="fx-banner-title">{banner.title}</div>
            {banner.subtitle && <div className="fx-banner-subtitle">{banner.subtitle}</div>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="toasts">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className="toast"
              initial={{ y: -30, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0 }}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
