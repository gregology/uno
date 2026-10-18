import { memo, useId } from 'react';
import { cardLabel, type Card as CardData, type CardKind, type Color } from '../../shared/cards';

export const COLOR_HEX: Record<Color, string> = {
  red: '#ef3d3d',
  yellow: '#ffc61a',
  green: '#22b35c',
  blue: '#2479ea',
};

export const COLOR_NAMES: Record<Color, string> = {
  red: 'Red',
  yellow: 'Yellow',
  green: 'Green',
  blue: 'Blue',
};

const INK = '#1c1b2e';
const WILD_FACE = '#1c1b2e';
const QUADRANTS: Color[] = ['red', 'blue', 'yellow', 'green'];

/** A shape per colour so colour-blind players can tell them apart. */
export function ColorShape({ color, size = 10, fill = '#fff' }: { color: Color; size?: number; fill?: string }) {
  const s = size;
  const stroke = { stroke: INK, strokeWidth: s * 0.18, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
  switch (color) {
    case 'red':
      return <polygon points={`0,${-s * 0.62} ${s * 0.6},${s * 0.45} ${-s * 0.6},${s * 0.45}`} fill={fill} {...stroke} />;
    case 'yellow':
      return <circle r={s * 0.5} fill={fill} {...stroke} />;
    case 'green':
      return <rect x={-s * 0.45} y={-s * 0.45} width={s * 0.9} height={s * 0.9} fill={fill} {...stroke} />;
    case 'blue':
      return <polygon points={`0,${-s * 0.62} ${s * 0.55},0 0,${s * 0.62} ${-s * 0.55},0`} fill={fill} {...stroke} />;
  }
}

function WildOval({ rx, ry, clipId }: { rx: number; ry: number; clipId: string }) {
  return (
    <g transform="rotate(28)">
      <clipPath id={clipId}>
        <ellipse rx={rx} ry={ry} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {QUADRANTS.map((color, i) => (
          <rect
            key={color}
            x={i % 2 === 0 ? -rx : 0}
            y={i < 2 ? -ry : 0}
            width={rx}
            height={ry}
            fill={COLOR_HEX[color]}
          />
        ))}
      </g>
      <ellipse rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth={rx * 0.12} />
    </g>
  );
}

interface SymbolProps {
  kind: CardKind;
  value: number | null;
  /** Fill colour of the symbol itself. */
  fill: string;
  size: number;
  clipId: string;
}

/** The picture for a card kind, centred on (0, 0) and roughly `size` tall. */
function CardSymbol({ kind, value, fill, size, clipId }: SymbolProps) {
  const k = size / 40;
  const outline = { stroke: INK, strokeWidth: 3 / k, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
  const text = (label: string, fontSize: number) => (
    <text
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={fontSize}
      fontWeight={700}
      fill={fill}
      {...outline}
      strokeWidth={fontSize * 0.09}
    >
      {label}
    </text>
  );
  switch (kind) {
    case 'number':
      return (
        <g transform={`scale(${k})`}>
          {text(String(value), 54)}
          {(value === 6 || value === 9) && <rect x={-12} y={24} width={24} height={4.5} rx={2} fill={fill} {...outline} />}
        </g>
      );
    case 'draw2':
      return <g transform={`scale(${k})`}>{text('+2', 38)}</g>;
    case 'wild4':
      return <g transform={`scale(${k})`}>{text('+4', 38)}</g>;
    case 'wild':
      return <WildOval rx={size * 0.34} ry={size * 0.5} clipId={clipId} />;
    case 'skip':
      return (
        <g transform={`scale(${k})`} fill="none" strokeLinecap="round">
          <circle r={15} stroke={INK} strokeWidth={11} />
          <line x1={-10} y1={10} x2={10} y2={-10} stroke={INK} strokeWidth={11} />
          <circle r={15} stroke={fill} strokeWidth={6} />
          <line x1={-10} y1={10} x2={10} y2={-10} stroke={fill} strokeWidth={6} />
        </g>
      );
    case 'reverse': {
      const arrow = 'M 0 -19 L 11 -5 L 4 -5 L 4 17 L -4 17 L -4 -5 L -11 -5 Z';
      return (
        <g transform={`scale(${k}) rotate(45)`} fill={fill} {...outline}>
          <path d={arrow} transform="translate(-8 -2)" />
          <path d={arrow} transform="translate(8 2) rotate(180)" />
        </g>
      );
    }
    case 'swap': {
      const arrow = 'M 19 0 L 5 -11 L 5 -4 L -19 -4 L -19 4 L 5 4 L 5 11 Z';
      return (
        <g transform={`scale(${k})`} fill={fill} {...outline}>
          <path d={arrow} transform="translate(0 -9)" />
          <path d={arrow} transform="translate(0 9) rotate(180)" />
        </g>
      );
    }
    case 'rotate': {
      // Two chasing arrows around a circle: every hand moves on.
      const arc = (start: number) => {
        const r = 14;
        const a0 = ((start + 20) * Math.PI) / 180;
        const a1 = ((start + 150) * Math.PI) / 180;
        const head = ((start + 172) * Math.PI) / 180;
        const p = (a: number, radius = r) => `${(Math.cos(a) * radius).toFixed(2)} ${(Math.sin(a) * radius).toFixed(2)}`;
        return (
          <g key={start}>
            <path d={`M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`} fill="none" stroke={INK} strokeWidth={11} strokeLinecap="round" />
            <path d={`M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`} fill="none" stroke={fill} strokeWidth={6} strokeLinecap="round" />
            <path d={`M ${p(a1, r - 9)} L ${p(head)} L ${p(a1, r + 9)} Z`} fill={fill} {...outline} />
          </g>
        );
      };
      return <g transform={`scale(${k})`}>{[arc(0), arc(180)]}</g>;
    }
  }
}

function CardFaceSvg({ card }: { card: CardData }) {
  const id = useId();
  const wild = card.color === null;
  const face = wild ? WILD_FACE : COLOR_HEX[card.color!];
  const centerFill = wild ? '#fff' : face;
  const cornerKind = card.kind === 'wild' ? 'wild' : card.kind;
  return (
    <svg viewBox="0 0 100 150" className="card-svg" role="img" aria-label={cardLabel(card)}>
      <rect width="100" height="150" rx="12" fill="#fff" />
      <rect x="5" y="5" width="90" height="140" rx="8" fill={face} />
      <g transform="translate(50 75)">
        {wild ? (
          card.kind === 'wild4' && <WildOval rx={30} ry={50} clipId={`${id}-o`} />
        ) : (
          <ellipse rx="32" ry="53" transform="rotate(28)" fill="#fff" />
        )}
        <CardSymbol kind={card.kind} value={card.value} fill={centerFill} size={card.kind === 'wild' ? 100 : 46} clipId={`${id}-c`} />
      </g>
      {[0, 180].map((turn) => (
        <g key={turn} transform={`rotate(${turn} 50 75)`}>
          <g transform="translate(17 22)">
            <CardSymbol kind={cornerKind} value={card.value} fill="#fff" size={cornerKind === 'wild' ? 22 : 16} clipId={`${id}-k${turn}`} />
          </g>
          {card.color && (
            <g transform="translate(83 20)">
              <ColorShape color={card.color} size={10} />
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

function CardBackSvg() {
  return (
    <svg viewBox="0 0 100 150" className="card-svg" aria-hidden="true">
      <rect width="100" height="150" rx="12" fill="#fff" />
      <rect x="5" y="5" width="90" height="140" rx="8" fill="#2b1f6b" />
      <g transform="translate(50 75) rotate(28)">
        <ellipse rx="33" ry="54" fill="#3b2c8f" stroke="#fff" strokeWidth="3" />
        {QUADRANTS.map((color, i) => (
          <circle key={color} cx={i % 2 ? 12 : -12} cy={i < 2 ? -34 : 34} r="6" fill={COLOR_HEX[color]} stroke="#fff" strokeWidth="1.5" />
        ))}
      </g>
      <g transform="translate(50 76) rotate(-62)">
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="30"
          fontWeight="700"
          fill="#ffc61a"
          stroke={INK}
          strokeWidth="5"
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          UNO!
        </text>
      </g>
    </svg>
  );
}

export const CardFace = memo(CardFaceSvg, (a, b) => a.card.id === b.card.id);
export const CardBack = memo(CardBackSvg);
