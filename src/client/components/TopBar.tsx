import { connection } from '../lib/connection';
import { setMuted, soundSettings, unlockAudio } from '../lib/sound';
import { useStore } from '../lib/store';
import { Logo } from './Logo';

interface TopBarProps {
  onHelp: () => void;
  onLeave: () => void;
}

export function TopBar({ onHelp, onLeave }: TopBarProps) {
  const { muted } = useStore(soundSettings);
  const { online } = useStore(connection);
  return (
    <header className="topbar">
      <Logo />
      {!online && <span className="pill pill-warn">Reconnecting…</span>}
      <div className="topbar-actions">
        <button
          type="button"
          className="icon-btn"
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          onClick={() => {
            unlockAudio();
            setMuted(!muted);
          }}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="icon-btn" aria-label="How to play" onClick={onHelp}>
          ?
        </button>
        <button type="button" className="icon-btn" aria-label="Leave the table" onClick={onLeave}>
          🚪
        </button>
      </div>
    </header>
  );
}
