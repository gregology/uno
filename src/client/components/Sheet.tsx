import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cls } from '../lib/game';

interface SheetProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}

/** A panel that springs up from the bottom of the screen. Use inside AnimatePresence. */
export function Sheet({ title, children, onClose, className }: SheetProps) {
  return (
    <motion.div
      className="sheet-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className={cls('sheet', className)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: '110%' }}
        animate={{ y: 0 }}
        exit={{ y: '110%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          )}
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
