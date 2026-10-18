import { AnimatePresence, motion, useAnimate } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { compareCards, type Card, type Color } from '../../shared/cards';
import type { TableView } from '../../shared/protocol';
import { send } from '../lib/connection';
import { fx, toast } from '../lib/fx';
import { canDraw, isMyTurn, isSeated, jumpableIds, playableIds } from '../lib/game';
import { sfx, unlockAudio } from '../lib/sound';
import { useStore } from '../lib/store';
import { keepAwake } from '../lib/wakeLock';
import { ActionBar } from './ActionBar';
import { CenterTable } from './CenterTable';
import { FxLayer } from './FxLayer';
import { Hand } from './Hand';
import { Opponents } from './Opponents';
import { ColorPicker, SwapPicker } from './Pickers';
import { RulesSheet } from './RulesSheet';
import { Sheet } from './Sheet';
import { StatusBar } from './StatusBar';
import { TopBar } from './TopBar';
import { WinnerOverlay } from './WinnerOverlay';

async function act(promise: ReturnType<typeof send>, fallback?: string): Promise<void> {
  const result = await promise;
  if (!result.ok) {
    sfx.nope();
    toast(fallback ?? result.error);
  }
}

export function TableScreen({ view, receivedAt }: { view: TableView; receivedAt: number }) {
  const me = view.me!;
  const seated = isSeated(view);
  const myTurn = isMyTurn(view);
  const [sheet, setSheet] = useState<'rules' | 'leave' | null>(null);
  const [scope, animate] = useAnimate();
  const { shake } = useStore(fx);

  const deadline = view.turnMsRemaining !== null ? receivedAt + view.turnMsRemaining : null;
  const phaseDeadline = view.phaseMsRemaining !== null ? receivedAt + view.phaseMsRemaining : null;
  const hand = useMemo(() => [...me.hand].sort(compareCards), [me.hand]);
  const playable = useMemo(() => playableIds(view), [view]);
  const jumpable = useMemo(() => jumpableIds(view), [view]);
  const choosing = view.pendingChoice?.playerId === me.id ? view.pendingChoice.type : null;

  useEffect(() => {
    keepAwake(true);
    // Reloading the page skips the join tap, so unlock audio on the first touch instead.
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    if (shake > 0 && scope.current) void animate(scope.current, { x: [0, -12, 12, -8, 8, -4, 0] }, { duration: 0.45 });
  }, [shake, animate, scope]);

  const play = (card: Card) => {
    const jumping = jumpable.has(card.id);
    void act(send('play', { cardId: card.id }), jumping ? 'Too slow! Someone got there first' : undefined);
  };
  const draw = () => void act(send('draw', {}));
  const pass = () => void act(send('pass', {}));
  const pickColor = (color: Color) => void act(send('chooseColor', { color }));
  const pickSwap = (targetId: string) => void act(send('chooseSwap', { targetId }));
  const leave = () => {
    setSheet(null);
    keepAwake(false);
    void send('leave', {});
  };

  return (
    <motion.main ref={scope} className="table-screen">
      <TopBar onHelp={() => setSheet('rules')} onLeave={() => setSheet('leave')} />
      <Opponents view={view} deadline={deadline} />
      <CenterTable view={view} phaseDeadline={phaseDeadline} canDraw={canDraw(view)} onDraw={draw} />
      <StatusBar view={view} deadline={deadline} />
      {seated ? (
        <Hand
          cards={hand}
          roundId={view.roundId}
          playable={playable}
          jumpable={jumpable}
          drawnCardId={me.drawnCardId}
          myTurn={myTurn}
          emptyText={view.phase === 'ended' || view.phase === 'playing' ? "You're in for the next game" : null}
          onPlay={play}
        />
      ) : (
        <div className="hand-zone hand-placeholder">
          {me.status === 'waiting'
            ? `You're number ${view.spectators.findIndex((s) => s.id === me.id) + 1} in line for a seat`
            : "You'll be dealt in shortly"}
        </div>
      )}
      <ActionBar view={view} onDraw={draw} onPass={pass} />

      <AnimatePresence>
        {choosing === 'color' && <ColorPicker key="color" onPick={pickColor} />}
        {choosing === 'swap' && <SwapPicker key="swap" view={view} onPick={pickSwap} />}
        {view.phase === 'ended' && view.winnerId && (
          <WinnerOverlay key={`win-${view.roundId}`} view={view} phaseDeadline={phaseDeadline} />
        )}
        {sheet === 'rules' && <RulesSheet key="rules" onClose={() => setSheet(null)} />}
        {sheet === 'leave' && (
          <Sheet key="leave" title="Leave the table?" onClose={() => setSheet(null)}>
            <p className="sheet-text">
              {view.phase === 'playing' && seated
                ? 'Your hand is kept until the end of this game in case you come back.'
                : 'You can sit back down any time.'}
            </p>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setSheet(null)}>
                Stay
              </button>
              <button type="button" className="btn btn-danger" onClick={leave}>
                Leave
              </button>
            </div>
          </Sheet>
        )}
      </AnimatePresence>
      <FxLayer />
    </motion.main>
  );
}
