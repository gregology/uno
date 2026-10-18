import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { buildDeck, MAX_PLAYERS } from '../../shared/cards';
import { AVATARS, NAME_MAX_LENGTH, type Notice, type TableView } from '../../shared/protocol';
import { clearNotice, send } from '../lib/connection';
import { cls } from '../lib/game';
import { prefs } from '../lib/prefs';
import { unlockAudio } from '../lib/sound';
import { keepAwake } from '../lib/wakeLock';
import { CardFace } from './Card';
import { Logo } from './Logo';

const SHOWCASE = (() => {
  const deck = buildDeck();
  const pick = (kind: string, color: string | null) => deck.find((c) => c.kind === kind && c.color === color)!;
  return [pick('rotate', 'red'), pick('wild4', null), pick('swap', 'blue'), pick('skip', 'green'), pick('draw2', 'yellow')];
})();

function TableSummary({ view }: { view: TableView }) {
  const players = view.players;
  if (players.length === 0) return <p className="summary">Nobody's here yet. Be the first!</p>;
  const full = players.length >= MAX_PLAYERS;
  return (
    <div className="summary">
      <div className="summary-avatars">
        {players.map((p) => (
          <span key={p.id} title={p.name}>
            {p.avatar}
          </span>
        ))}
      </div>
      <p>
        {players.length === 1
          ? `${players[0]!.name} is waiting for someone to play with`
          : `${players.length} players${view.phase === 'playing' ? ' mid-game' : ' at the table'}`}
        {full && '. The table is full, so you will be seated when someone leaves'}
      </p>
    </div>
  );
}

export function JoinScreen({ view, notice }: { view: TableView; notice: Notice | null }) {
  const [name, setName] = useState(() => prefs.name || view.me?.name || '');
  const [avatar, setAvatar] = useState(
    () => prefs.avatar ?? view.me?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)]!,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = view.players.length >= MAX_PLAYERS;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    unlockAudio();
    keepAwake(true);
    prefs.name = name.trim();
    prefs.avatar = avatar;
    clearNotice();
    setBusy(true);
    const result = await send('join', { name, avatar });
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <main className="join-screen">
      <div className="join-fan" aria-hidden="true">
        {SHOWCASE.map((card, i) => (
          <motion.span
            key={card.id}
            className="join-fan-card"
            initial={{ y: 200, rotate: 0, opacity: 0 }}
            animate={{ y: Math.abs(i - 2) * 10, rotate: (i - 2) * 14, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 120, damping: 14, delay: 0.15 + i * 0.08 }}
          >
            <CardFace card={card} />
          </motion.span>
        ))}
      </div>
      <Logo big />
      <p className="tagline">Rotate. Swap. Jump in. Last card wins.</p>

      {notice?.kind === 'kicked' && (
        <motion.div className="notice" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          {notice.message}
        </motion.div>
      )}

      <form className="join-card" onSubmit={submit}>
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={NAME_MAX_LENGTH * 2}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Ana"
            autoComplete="nickname"
            enterKeyHint="go"
            autoFocus={!prefs.name}
          />
        </label>
        <div className="field">
          <span>Pick your player</span>
          <div className="avatar-grid" role="radiogroup" aria-label="Avatar">
            {AVATARS.map((a) => (
              <motion.button
                key={a}
                type="button"
                role="radio"
                aria-checked={a === avatar}
                className={cls('avatar-choice', a === avatar && 'is-selected')}
                whileTap={{ scale: 0.85 }}
                animate={a === avatar ? { scale: 1.15, rotate: [0, -10, 10, 0] } : { scale: 1, rotate: 0 }}
                onClick={() => setAvatar(a)}
              >
                {a}
              </motion.button>
            ))}
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <motion.button
          type="submit"
          className="btn btn-primary btn-big"
          disabled={busy || !name.trim()}
          whileTap={{ scale: 0.94 }}
        >
          {full ? 'Join the queue' : view.phase === 'playing' ? 'Jump in!' : 'Take a seat'}
        </motion.button>
      </form>

      <TableSummary view={view} />
    </main>
  );
}
