import { motion } from 'motion/react';
import type { TableView } from '../../shared/protocol';
import { useSecondsLeft } from '../lib/game';

export function WinnerOverlay({ view, phaseDeadline }: { view: TableView; phaseDeadline: number | null }) {
  const seconds = useSecondsLeft(phaseDeadline);
  const winner = view.players.find((p) => p.id === view.winnerId);
  const youWon = view.winnerId === view.me?.id;
  const standings = [...view.players].sort((a, b) => b.wins - a.wins);
  return (
    <motion.div className="winner-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="winner-card"
        initial={{ scale: 0.3, rotate: -12, y: 60 }}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        exit={{ scale: 0.6, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 16 }}
      >
        <motion.div
          className="winner-avatar"
          animate={{ y: [0, -18, 0], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          <span className="winner-crown">👑</span>
          {winner?.avatar ?? '🏆'}
        </motion.div>
        <h2 className="winner-title">{youWon ? 'You win!' : `${winner?.name ?? 'Somebody'} wins!`}</h2>
        <ol className="standings">
          {standings.map((p) => (
            <li key={p.id} className={p.id === view.winnerId ? 'is-winner' : undefined}>
              <span>{p.avatar}</span>
              <span className="standings-name">{p.id === view.me?.id ? `${p.name} (you)` : p.name}</span>
              <span className="standings-wins">
                {p.wins} {p.wins === 1 ? 'win' : 'wins'}
              </span>
            </li>
          ))}
        </ol>
        {seconds !== null && <p className="winner-next">Next game in {seconds}…</p>}
      </motion.div>
    </motion.div>
  );
}
