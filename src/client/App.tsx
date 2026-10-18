import { MotionConfig, motion } from 'motion/react';
import { JoinScreen } from './components/JoinScreen';
import { Logo } from './components/Logo';
import { TableScreen } from './components/TableScreen';
import { clearNotice, connection, hello } from './lib/connection';
import { useStore } from './lib/store';

function Splash({ text }: { text: string }) {
  return (
    <main className="splash">
      <Logo big />
      <motion.p animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }}>
        {text}
      </motion.p>
    </main>
  );
}

function Screen() {
  const { view, notice, receivedAt, online } = useStore(connection);
  if (!view) return <Splash text={online ? 'Finding the table…' : 'Connecting…'} />;
  if (notice?.kind === 'replaced') {
    return (
      <main className="splash">
        <Logo big />
        <p>{notice.message}</p>
        <button
          type="button"
          className="btn btn-primary btn-big"
          onClick={() => {
            clearNotice();
            hello();
          }}
        >
          Play here instead
        </button>
      </main>
    );
  }
  if (!view.me || view.me.status === 'away') return <JoinScreen view={view} notice={notice} />;
  return <TableScreen view={view} receivedAt={receivedAt} />;
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="backdrop" aria-hidden="true">
        <span className="blob blob-red" />
        <span className="blob blob-yellow" />
        <span className="blob blob-green" />
        <span className="blob blob-blue" />
      </div>
      <Screen />
    </MotionConfig>
  );
}
