import { buildDeck, type CardKind } from '../../shared/cards';
import { CardFace } from './Card';
import { Sheet } from './Sheet';

const deck = buildDeck();
const sample = (kind: CardKind) => deck.find((c) => c.kind === kind && (c.color === 'blue' || c.color === null))!;

const CARDS: { kind: CardKind; title: string; text: string }[] = [
  { kind: 'skip', title: 'Skip', text: 'The next player misses their turn.' },
  { kind: 'reverse', title: 'Reverse', text: 'Play changes direction. With two players it works like a Skip.' },
  { kind: 'draw2', title: 'Draw Two', text: 'The next player picks up 2, unless they stack a +2 or +4 on top.' },
  { kind: 'rotate', title: 'Rotate', text: 'Every hand passes to the next player in the direction of play.' },
  { kind: 'swap', title: 'Swap', text: 'Trade your whole hand with any player you choose.' },
  { kind: 'wild', title: 'Wild', text: 'Play on anything and pick the next colour.' },
  { kind: 'wild4', title: 'Wild +4', text: 'Pick a colour, and the next player picks up 4 unless they stack another +4.' },
];

export function RulesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="How to play" onClose={onClose} className="rules">
      <p>
        Match the top card by <b>colour</b>, <b>number</b> or <b>symbol</b>. Can't go? Tap the deck to draw one. If it
        fits you can play it straight away. First to empty their hand wins, even if the last card is a Rotate or Swap.
      </p>
      <ul className="rules-cards">
        {CARDS.map(({ kind, title, text }) => (
          <li key={kind}>
            <span className="rules-card">
              <CardFace card={sample(kind)} />
            </span>
            <span>
              <b>{title}</b> {text}
            </span>
          </li>
        ))}
      </ul>
      <h3>House rules</h3>
      <ul className="rules-list">
        <li>
          <b>Stacking:</b> +2 on +2, +4 on +4 or +4 on +2 passes the total on. Never +2 on +4.
        </li>
        <li>
          <b>Jump-in:</b> holding the exact same card as the top one? Play it any time, even out of turn. Play carries on
          from you.
        </li>
        <li>
          <b>30 second turns:</b> run out of time and a card is picked up for you. Five automatic turns in a row and
          you're out.
        </li>
      </ul>
    </Sheet>
  );
}
