'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

interface Card {
  id: string;
  kind: 'suit' | 'trump' | 'excuse';
  suit?: Suit;
  value: number;
  faceUp: boolean;
}

type SelectedSource =
  | { from: 'col'; index: number; cardIndex: number }
  | { from: 'excuse' };

type LastMove =
  | { type: 'col'; index: number }
  | { type: 'fdn'; index: number }
  | { type: 'distribute' }
  | { type: 'excuse' };

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const SUIT_SYM: Record<Suit, string> = {
  hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠',
};
const COL_SIZES = [1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
const VAL_DISPLAY: Record<number, string> = {
  1: 'A', 11: 'V', 12: 'C', 13: 'D', 14: 'R',
};

// ═══════════════════════════════════════════════════════════════════
// Deck & shuffle
// ═══════════════════════════════════════════════════════════════════

function createDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS)
    for (let v = 1; v <= 14; v++)
      cards.push({ id: `${suit[0]}${v}`, kind: 'suit', suit, value: v, faceUp: false });
  for (let v = 1; v <= 21; v++)
    cards.push({ id: `t${v}`, kind: 'trump', value: v, faceUp: false });
  cards.push({ id: 'ex', kind: 'excuse', value: 0, faceUp: false });
  return cards;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════
// Display helpers
// ═══════════════════════════════════════════════════════════════════

const isRed = (c: Card) => c.suit === 'hearts' || c.suit === 'diamonds';

const displayVal = (c: Card): string => {
  if (c.kind === 'excuse') return '?';
  if (c.kind === 'trump') return String(c.value);
  return VAL_DISPLAY[c.value] ?? String(c.value);
};

const suitSym = (c: Card): string => {
  if (c.kind === 'excuse') return '';
  if (c.kind === 'trump') return '';
  return SUIT_SYM[c.suit!];
};

// Card colors: suit=red/black on white, trump=gold on dark, excuse=gold on dark
const textColor = (c: Card): string => {
  if (c.kind === 'excuse') return '#fbbf24';
  if (c.kind === 'trump') return '#fbbf24';
  return isRed(c) ? '#dc2626' : '#1e293b';
};

const cardBg = (c: Card, selected: boolean): string => {
  if (c.kind === 'trump') return selected ? '#374151' : '#1f2937';
  if (c.kind === 'excuse') return selected ? '#374151' : '#1f2937';
  if (selected) return '#fefce8';
  return '#ffffff';
};

const cardBorder = (c: Card, selected: boolean): string => {
  if (selected) return '2px solid #f59e0b';
  if (c.kind === 'trump' || c.kind === 'excuse') return '1px solid #4b5563';
  return '1px solid #e5e7eb';
};

// ═══════════════════════════════════════════════════════════════════
// Game state
// ═══════════════════════════════════════════════════════════════════

interface GameState {
  columns: Card[][];
  foundations: Card[][];
  excuseSlot: Card | null;
  stock: Card[];
  selected: SelectedSource | null;
  gameOver: boolean;
  moves: number;
  lastMove: LastMove | null;
  trumpsMerged: boolean;
}

function newGameState(): GameState {
  const deck = shuffle(createDeck());
  const columns: Card[][] = [];
  let idx = 0;
  for (const size of COL_SIZES) {
    const col = deck.slice(idx, idx + size).map((c, i, a) => ({
      ...c,
      faceUp: i === a.length - 1,
    }));
    columns.push(col);
    idx += size;
  }
  return {
    columns,
    foundations: [[], [], [], [], [], []],
    excuseSlot: null,
    stock: deck.slice(idx),
    selected: null,
    gameOver: false,
    moves: 0,
    lastMove: null,
    trumpsMerged: false,
  };
}

// ═══════════════════════════════════════════════════════════════════
// Placement rules
// ═══════════════════════════════════════════════════════════════════

function canPlaceOnColumn(card: Card, col: Card[]): boolean {
  if (card.kind === 'excuse') return true;
  if (col.length === 0) return true;
  const top = col[col.length - 1];
  if (top.kind === 'excuse') return true;
  if (card.kind === 'trump') {
    return top.kind === 'trump' && card.value === top.value - 1;
  }
  if (top.kind === 'suit') {
    return isRed(card) !== isRed(top) && card.value === top.value - 1;
  }
  return false;
}

function canPlaceOnFoundation(card: Card, fi: number, allFdns: Card[][], merged: boolean): boolean {
  const fdn = allFdns[fi];
  if (fi < 4) {
    if (card.kind !== 'suit' || card.suit !== SUITS[fi]) return false;
    return fdn.length === 0 ? card.value === 1 : card.value === fdn[fdn.length - 1].value + 1;
  }
  if (fi === 4) {
    if (card.kind !== 'trump') return false;
    if (merged) return false;
    if (fdn.length === 0) return card.value === 1;
    return card.value === fdn[fdn.length - 1].value + 1;
  }
  if (fi === 5) {
    if (card.kind !== 'trump') return false;
    if (merged) return false;
    if (fdn.length === 0) return card.value === 21;
    return card.value === fdn[fdn.length - 1].value - 1;
  }
  return false;
}

function findFoundation(card: Card, fdns: Card[][], merged: boolean): number {
  for (let i = 0; i < 6; i++)
    if (canPlaceOnFoundation(card, i, fdns, merged)) return i;
  return -1;
}

function canMergeTrumps(gs: GameState): boolean {
  if (gs.trumpsMerged) return false;
  const asc = gs.foundations[4];
  const desc = gs.foundations[5];
  if (asc.length === 0 || desc.length === 0) return false;
  return asc[asc.length - 1].value + 1 === desc[desc.length - 1].value;
}

function countAllPlaced(gs: GameState): number {
  return gs.foundations.reduce((s, f) => s + f.length, 0)
    + (gs.excuseSlot !== null ? 1 : 0);
}

function isWin(gs: GameState): boolean {
  const suitsDone = gs.foundations[0].length === 14 && gs.foundations[1].length === 14
    && gs.foundations[2].length === 14 && gs.foundations[3].length === 14;
  const trumpsDone = gs.foundations[4].length + gs.foundations[5].length === 21;
  const excuseDone = gs.excuseSlot !== null;
  return suitsDone && trumpsDone && excuseDone;
}

// ═══════════════════════════════════════════════════════════════════
// State helpers
// ═══════════════════════════════════════════════════════════════════

function cloneGs(gs: GameState): GameState {
  return {
    ...gs,
    columns: gs.columns.map(c => c.map(card => ({ ...card }))),
    foundations: gs.foundations.map(f => f.map(card => ({ ...card }))),
    stock: gs.stock.map(c => ({ ...c })),
    excuseSlot: gs.excuseSlot ? { ...gs.excuseSlot } : null,
  };
}

function revealBottom(col: Card[]) {
  if (col.length > 0 && !col[col.length - 1].faceUp)
    col[col.length - 1].faceUp = true;
}

function getSelectedCard(gs: GameState): Card | null {
  if (!gs.selected) return null;
  if (gs.selected.from === 'excuse') return gs.excuseSlot;
  const col = gs.columns[gs.selected.index];
  const ci = gs.selected.cardIndex;
  return ci < col.length ? col[ci] : null;
}

function removeSelectedCards(gs: GameState): Card[] {
  if (!gs.selected) return [];
  if (gs.selected.from === 'excuse') {
    const card = gs.excuseSlot;
    gs.excuseSlot = null;
    return card ? [card] : [];
  }
  const col = gs.columns[gs.selected.index];
  const removed = col.splice(gs.selected.cardIndex);
  revealBottom(col);
  return removed;
}

function cardTopCss(col: Card[], idx: number): string {
  const fdi = col.findIndex(c => c.faceUp);
  const fd = fdi < 0 ? col.length : fdi;
  return `calc(${Math.min(idx, fd)} * var(--peek-down) + ${Math.max(0, idx - fd)} * var(--peek-up))`;
}

function colHeight(col: Card[]): string {
  if (col.length === 0) return 'var(--card-h)';
  const fdi = col.findIndex(c => c.faceUp);
  const fd = fdi < 0 ? col.length : fdi;
  const fu = Math.max(0, col.length - fd - 1);
  return `calc(${fd} * var(--peek-down) + ${fu} * var(--peek-up) + var(--card-h))`;
}

// ═══════════════════════════════════════════════════════════════════
// Sparkle effect
// ═══════════════════════════════════════════════════════════════════

function SparkleOverlay() {
  const particles = useMemo(() =>
    Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const dist = 14 + Math.random() * 16;
      return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        delay: i * 0.035,
        size: 3 + Math.random() * 3,
        isStar: Math.random() > 0.5,
      };
    }), []
  );

  return (
    <div style={{
      position: 'absolute', top: '50%', left: '50%',
      width: 0, height: 0, zIndex: 200, pointerEvents: 'none',
    }}>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: p.size, height: p.size,
            marginLeft: -p.size / 2, marginTop: -p.size / 2,
            borderRadius: p.isStar ? '1px' : '50%',
            background: p.isStar ? '#fde68a' : '#fbbf24',
            boxShadow: `0 0 ${p.size}px ${p.isStar ? '#fde68a' : '#fbbf24'}`,
            animation: `${p.isStar ? 'sparkle-star' : 'sparkle-fly'} 0.55s ${p.delay}s ease-out forwards`,
            '--sx': `${p.x}px`, '--sy': `${p.y}px`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Card sub-components
// ═══════════════════════════════════════════════════════════════════

function CardFace({ card, selected, landing, appearing, appearDelay, onClick, onDoubleClick }: {
  card: Card;
  selected?: boolean;
  landing?: boolean;
  appearing?: boolean;
  appearDelay?: number;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}) {
  const color = textColor(card);
  const bg = cardBg(card, !!selected);
  const border = cardBorder(card, !!selected);
  const isExcuse = card.kind === 'excuse';
  const isTrump = card.kind === 'trump';
  const isDark = isTrump || isExcuse;

  const animStyle: React.CSSProperties = {};
  if (landing) {
    animStyle.animation = 'card-land 0.45s ease-out';
  } else if (selected) {
    animStyle.animation = 'card-selected 0.2s ease-out forwards, glow-pulse 1.2s ease-in-out 0.2s infinite';
  } else if (appearing) {
    animStyle.animation = `card-appear 0.4s ${(appearDelay ?? 0) * 0.07}s ease-out both`;
  }

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="cursor-pointer select-none"
      style={{
        width: 'var(--card-w)', height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        background: bg,
        border,
        boxShadow: selected
          ? '0 0 12px rgba(245,158,11,0.5), 0 4px 8px rgba(0,0,0,0.3)'
          : isDark
            ? '0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 1px 4px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
        display: 'flex', flexDirection: 'column',
        alignItems: isExcuse ? 'center' : 'flex-start',
        justifyContent: isExcuse ? 'center' : 'flex-start',
        padding: isExcuse ? '0' : 'calc(var(--card-fs) * 0.2)',
        fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif',
        color,
        overflow: 'hidden', position: 'relative',
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        ...animStyle,
      }}
    >
      {isExcuse ? (
        /* ── Excuse: centered "?" with label ── */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '1px',
        }}>
          <div style={{
            fontSize: 'var(--card-fs-lg)',
            fontWeight: 900,
            lineHeight: 1,
            color: '#fbbf24',
            textShadow: '0 0 8px rgba(251,191,36,0.4)',
          }}>
            ?
          </div>
          <div style={{
            fontSize: 'calc(var(--card-fs) * 0.55)',
            fontWeight: 600,
            lineHeight: 1,
            color: '#9ca3af',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}>
            Excuse
          </div>
        </div>
      ) : isTrump ? (
        /* ── Trump: bold number only, no symbol ── */
        <>
          {/* Top-left number */}
          <div style={{
            fontSize: 'var(--card-fs)',
            fontWeight: 900,
            lineHeight: 1,
            color: '#fbbf24',
            letterSpacing: '-0.5px',
          }}>
            {displayVal(card)}
          </div>

          {/* Center: large number watermark */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 'var(--card-fs-lg)',
            fontWeight: 900,
            lineHeight: 1,
            color: '#fbbf24',
            opacity: 0.15,
          }}>
            {displayVal(card)}
          </div>

          {/* Subtle top accent line */}
          <div style={{
            position: 'absolute',
            top: 0, left: '15%', right: '15%',
            height: '2px',
            background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)',
            opacity: 0.3,
            borderRadius: '0 0 2px 2px',
          }} />

          {/* Bottom-right number (inverted) */}
          <div style={{
            position: 'absolute',
            bottom: 'calc(var(--card-fs) * 0.2)',
            right: 'calc(var(--card-fs) * 0.25)',
            fontSize: 'var(--card-fs)',
            fontWeight: 900,
            lineHeight: 1,
            color: '#fbbf24',
            transform: 'rotate(180deg)',
            letterSpacing: '-0.5px',
          }}>
            {displayVal(card)}
          </div>
        </>
      ) : (
        /* ── Suit cards: classic layout ── */
        <>
          {/* Top-left: value + suit */}
          <div style={{
            fontSize: 'var(--card-fs)',
            fontWeight: 800,
            lineHeight: 1.05,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <span>{displayVal(card)}</span>
            <span style={{ fontSize: 'calc(var(--card-fs) * 0.85)' }}>{suitSym(card)}</span>
          </div>

          {/* Center: large suit symbol */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 'var(--card-fs-lg)',
            lineHeight: 1,
            opacity: 0.15,
            fontWeight: 700,
          }}>
            {suitSym(card)}
          </div>

          {/* Bottom-right (inverted) */}
          <div style={{
            position: 'absolute',
            bottom: 'calc(var(--card-fs) * 0.2)',
            right: 'calc(var(--card-fs) * 0.2)',
            fontSize: 'var(--card-fs)',
            fontWeight: 800,
            lineHeight: 1.05,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            transform: 'rotate(180deg)',
          }}>
            <span>{displayVal(card)}</span>
            <span style={{ fontSize: 'calc(var(--card-fs) * 0.85)' }}>{suitSym(card)}</span>
          </div>
        </>
      )}
      {landing && <SparkleOverlay />}
    </div>
  );
}

function CardBack({ onClick }: { onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      className="select-none"
      style={{
        width: 'var(--card-w)', height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        border: '1px solid #334155',
        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        background: `linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)`,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Diamond pattern overlay */}
      <div style={{
        position: 'absolute', inset: '3px',
        borderRadius: 'calc(var(--card-r) - 2px)',
        border: '1px solid rgba(251,191,36,0.15)',
        background: `repeating-conic-gradient(rgba(251,191,36,0.04) 0% 25%, transparent 0% 50%) 0 0 / 8px 8px`,
      }} />
    </div>
  );
}

function EmptySlot({ label, onClick, color }: {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  color?: string;
}) {
  return (
    <div
      onClick={onClick}
      className="select-none flex items-center justify-center"
      style={{
        width: 'var(--card-w)', height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        border: `2px dashed ${color ?? 'rgba(255,255,255,0.12)'}`,
        color: color ?? 'rgba(255,255,255,0.2)',
        fontSize: 'var(--card-fs)',
        fontFamily: '-apple-system, sans-serif',
        fontWeight: 700,
        cursor: onClick ? 'pointer' : 'default',
        lineHeight: 1.1,
        textAlign: 'center',
        whiteSpace: 'pre-line',
      }}
    >
      {label}
    </div>
  );
}

const FDN_CONFIG: { emptyLabel: string; color: string }[] = [
  { emptyLabel: '♥', color: 'rgba(220,38,38,0.25)' },
  { emptyLabel: '♦', color: 'rgba(220,38,38,0.25)' },
  { emptyLabel: '♣', color: 'rgba(255,255,255,0.15)' },
  { emptyLabel: '♠', color: 'rgba(255,255,255,0.15)' },
  { emptyLabel: '1\n↑', color: 'rgba(251,191,36,0.2)' },
  { emptyLabel: '21\n↓', color: 'rgba(251,191,36,0.2)' },
];

function FoundationSlot({ fdn, fi, onClick, landing, dirLabel }: {
  fdn: Card[];
  fi: number;
  onClick: () => void;
  landing?: boolean;
  dirLabel?: string;
}) {
  const cfg = FDN_CONFIG[fi];

  if (fdn.length === 0) {
    return (
      <div onClick={onClick} className="cursor-pointer">
        <EmptySlot label={cfg.emptyLabel} color={cfg.color} />
      </div>
    );
  }

  const topCard = fdn[fdn.length - 1];

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer"
      style={{
        animation: landing ? 'fdn-glow 0.6s ease-out' : undefined,
        borderRadius: 'var(--card-r)',
      }}
    >
      <CardFace card={topCard} landing={landing} />
      {/* Count badge */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          bottom: '-3px', right: '-3px',
          background: fi >= 4 ? '#92400e' : '#065f46',
          color: fi >= 4 ? '#fde68a' : '#a7f3d0',
          borderRadius: '999px',
          width: 'calc(var(--card-fs) * 1.3)',
          height: 'calc(var(--card-fs) * 1.3)',
          fontSize: 'calc(var(--card-fs) * 0.65)',
          fontWeight: 700,
          border: fi >= 4 ? '1px solid #b45309' : '1px solid #047857',
          fontFamily: '-apple-system, sans-serif',
        }}
      >
        {fdn.length}
      </div>
      {dirLabel && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            top: '-3px', left: '-3px',
            background: '#78350f', color: '#fde68a',
            borderRadius: '999px',
            width: 'calc(var(--card-fs) * 1.1)',
            height: 'calc(var(--card-fs) * 1.1)',
            fontSize: 'calc(var(--card-fs) * 0.65)',
            fontWeight: 700,
            border: '1px solid #92400e',
            fontFamily: '-apple-system, sans-serif',
          }}
        >
          {dirLabel}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════════════════════════════

export default function Page() {
  const [gs, setGs] = useState<GameState | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setGs(newGameState());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!gs?.lastMove) return;
    const dur = gs.lastMove.type === 'distribute' ? 900 : 700;
    const t = setTimeout(() => {
      setGs(prev => prev ? { ...prev, lastMove: null } : prev);
    }, dur);
    return () => clearTimeout(t);
  }, [gs?.moves, gs?.stock?.length]);

  const restart = useCallback(() => setGs(newGameState()), []);

  const distribute = useCallback(() => {
    setGs(prev => {
      if (!prev || prev.gameOver || prev.stock.length === 0) return prev;
      const s = cloneGs(prev);
      const count = Math.min(s.stock.length, 11);
      for (let i = 0; i < count; i++) {
        const card = s.stock.pop()!;
        card.faceUp = true;
        s.columns[i].push(card);
      }
      s.selected = null;
      s.lastMove = { type: 'distribute' };
      return s;
    });
  }, []);

  const clickCard = useCallback((ci: number, cardIdx: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];

      if (s.selected !== null) {
        if (s.selected.from === 'col' && s.selected.index === ci && s.selected.cardIndex === cardIdx) {
          s.selected = null; s.lastMove = null; return s;
        }
        if (s.selected.from === 'col' && s.selected.index === ci) {
          if (col[cardIdx]?.faceUp) {
            s.selected = { from: 'col', index: ci, cardIndex: cardIdx }; s.lastMove = null; return s;
          }
          s.selected = null; s.lastMove = null; return s;
        }

        const card = getSelectedCard(s);
        if (card && canPlaceOnColumn(card, col)) {
          const moved = removeSelectedCards(s);
          col.push(...moved);
          s.selected = null; s.moves++;
          s.lastMove = { type: 'col', index: ci };
          return s;
        }

        if (col[cardIdx]?.faceUp) {
          s.selected = { from: 'col', index: ci, cardIndex: cardIdx }; s.lastMove = null; return s;
        }
        s.selected = null; s.lastMove = null; return s;
      }

      if (!col[cardIdx]?.faceUp) return prev;
      s.selected = { from: 'col', index: ci, cardIndex: cardIdx }; s.lastMove = null;
      return s;
    });
  }, []);

  const clickColumn = useCallback((ci: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];

      if (s.selected !== null && col.length === 0) {
        const card = getSelectedCard(s);
        if (card && canPlaceOnColumn(card, col)) {
          const moved = removeSelectedCards(s);
          col.push(...moved);
          s.selected = null; s.moves++;
          s.lastMove = { type: 'col', index: ci };
          return s;
        }
        s.selected = null; s.lastMove = null; return s;
      }

      return prev;
    });
  }, []);

  const clickFoundation = useCallback((fi: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver || prev.selected === null) return prev;
      const s = cloneGs(prev);
      const card = getSelectedCard(s);
      const isSubSeq = s.selected?.from === 'col' && s.selected.cardIndex < s.columns[s.selected.index].length - 1;
      if (!card || isSubSeq || !canPlaceOnFoundation(card, fi, s.foundations, s.trumpsMerged)) {
        s.selected = null; return s;
      }
      removeSelectedCards(s);
      s.foundations[fi].push(card);
      s.selected = null; s.moves++;
      s.lastMove = { type: 'fdn', index: fi };
      if (isWin(s)) s.gameOver = true;
      return s;
    });
  }, []);

  const clickExcuseSlot = useCallback(() => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);

      if (s.selected !== null) {
        if (s.selected.from === 'excuse') {
          s.selected = null; return s;
        }

        const card = getSelectedCard(s);
        if (card && card.kind === 'excuse' && s.excuseSlot === null) {
          removeSelectedCards(s);
          card.faceUp = true;
          s.excuseSlot = card;
          s.selected = null; s.moves++;
          s.lastMove = { type: 'excuse' };
          return s;
        }
        s.selected = null; return s;
      }

      if (s.excuseSlot) {
        s.selected = { from: 'excuse' }; s.lastMove = null;
        return s;
      }

      return prev;
    });
  }, []);

  const mergeTrumps = useCallback(() => {
    setGs(prev => {
      if (!prev || prev.gameOver || !canMergeTrumps(prev)) return prev;
      const s = cloneGs(prev);
      const descReversed = [...s.foundations[5]].reverse();
      s.foundations[4] = [...s.foundations[4], ...descReversed];
      s.foundations[5] = [];
      s.trumpsMerged = true;
      s.moves++;
      s.lastMove = { type: 'fdn', index: 4 };
      if (isWin(s)) s.gameOver = true;
      return s;
    });
  }, []);

  const autoPlace = useCallback((ci: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];
      const card = col.length > 0 ? col[col.length - 1] : null;
      if (!card) return prev;

      if (card.kind === 'excuse' && s.excuseSlot === null) {
        col.pop(); revealBottom(col);
        card.faceUp = true;
        s.excuseSlot = card;
        s.selected = null; s.moves++;
        s.lastMove = { type: 'excuse' };
        return s;
      }

      const fi = findFoundation(card, s.foundations, s.trumpsMerged);
      if (fi === -1) return prev;
      col.pop(); revealBottom(col);
      s.foundations[fi].push(card);
      s.selected = null; s.moves++;
      s.lastMove = { type: 'fdn', index: fi };
      if (isWin(s)) s.gameOver = true;
      return s;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  if (!mounted || !gs) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-felt, radial-gradient(ellipse at 50% 40%, #1e293b 0%, #0f172a 70%))' }}>
        <p style={{
          fontFamily: '-apple-system, sans-serif', fontSize: '16px',
          color: 'rgba(255,255,255,0.4)', fontWeight: 500,
        }}>
          Distribution des cartes...
        </p>
      </div>
    );
  }

  const total = countAllPlaced(gs);
  const lm = gs.lastMove;
  const showMerge = canMergeTrumps(gs);
  const pct = Math.round((total / 78) * 100);

  return (
    <div
      className="min-h-screen select-none"
      style={{ background: 'var(--bg-felt, radial-gradient(ellipse at 50% 40%, #1e293b 0%, #0f172a 70%))' }}
      onClick={() => {
        if (gs.selected !== null) setGs(prev => prev ? ({ ...cloneGs(prev), selected: null, lastMove: null }) : prev);
      }}
    >
      <div className="mx-auto px-1 py-2 sm:px-3 sm:py-3 md:px-4"
        style={{ maxWidth: '960px' }} onClick={e => e.stopPropagation()}>

        {/* ─── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div>
            <h1 style={{
              fontFamily: '-apple-system, sans-serif',
              fontSize: 'clamp(14px, 3vw, 22px)',
              fontWeight: 700,
              color: '#fef3c7',
              letterSpacing: '-0.3px',
            }}>
              La Réussite
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3" style={{ fontFamily: '-apple-system, sans-serif' }}>
            {/* Progress pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '12px',
              padding: '3px 10px',
              fontSize: 'clamp(9px, 1.8vw, 12px)',
              color: '#fbbf24',
              fontWeight: 600,
            }}>
              <div style={{
                width: 'clamp(30px, 8vw, 50px)', height: '4px',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '2px',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              {total}/78
            </div>
            <span style={{
              fontSize: 'clamp(9px, 1.8vw, 12px)',
              color: 'rgba(255,255,255,0.4)',
              fontWeight: 500,
            }}>
              {gs.moves} coups
            </span>
            <button onClick={restart}
              style={{
                fontSize: 'clamp(9px, 1.8vw, 12px)',
                padding: '4px 10px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px',
                color: 'rgba(255,255,255,0.6)',
                cursor: 'pointer',
                fontWeight: 500,
                fontFamily: '-apple-system, sans-serif',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.08)')}
            >
              Nouvelle partie
            </button>
          </div>
        </div>

        {/* ─── Top row: Stock + Excuse + Foundations ──── */}
        <div className="flex items-start mb-2 sm:mb-4 flex-wrap" style={{ gap: 'clamp(2px, 0.8vw, 8px)' }}>
          {/* Stock */}
          <div onClick={(e) => { e.stopPropagation(); distribute(); }}>
            {gs.stock.length > 0 ? (
              <div className="relative">
                <CardBack onClick={() => {}} />
                <div className="absolute flex items-center justify-center"
                  style={{
                    bottom: '-3px', right: '-3px',
                    background: '#1e3a5f', color: '#93c5fd',
                    borderRadius: '999px',
                    width: 'calc(var(--card-fs) * 1.3)', height: 'calc(var(--card-fs) * 1.3)',
                    fontSize: 'calc(var(--card-fs) * 0.65)', fontWeight: 700,
                    border: '1px solid #3b82f6',
                    fontFamily: '-apple-system, sans-serif',
                  }}>
                  {gs.stock.length}
                </div>
              </div>
            ) : (
              <EmptySlot label="" />
            )}
          </div>

          {gs.stock.length > 0 && (
            <button onClick={(e) => { e.stopPropagation(); distribute(); }}
              style={{
                alignSelf: 'center',
                fontSize: 'clamp(8px, 1.3vw, 11px)',
                fontFamily: '-apple-system, sans-serif',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)', padding: '2px 4px',
                fontWeight: 500,
              }}>
              Distribuer
            </button>
          )}

          {/* Excuse slot */}
          <div onClick={(e) => { e.stopPropagation(); clickExcuseSlot(); }}>
            {gs.excuseSlot ? (
              <div className="relative cursor-pointer" style={{
                animation: lm?.type === 'excuse' ? 'fdn-glow 0.6s ease-out' : undefined,
                borderRadius: 'var(--card-r)',
              }}>
                <CardFace
                  card={gs.excuseSlot}
                  selected={gs.selected?.from === 'excuse'}
                  landing={lm?.type === 'excuse'}
                />
              </div>
            ) : (
              <div
                className="select-none flex flex-col items-center justify-center cursor-pointer"
                style={{
                  width: 'var(--card-w)', height: 'var(--card-h)',
                  borderRadius: 'var(--card-r)',
                  border: '2px dashed rgba(251,191,36,0.15)',
                  color: 'rgba(251,191,36,0.25)',
                  fontSize: 'calc(var(--card-fs) * 0.6)',
                  fontFamily: '-apple-system, sans-serif',
                  fontWeight: 600,
                  gap: '2px',
                }}
              >
                <span style={{ fontSize: 'var(--card-fs)', fontWeight: 900 }}>?</span>
                <span>Excuse</span>
              </div>
            )}
          </div>

          <div className="flex-1" />

          {/* 4 Suit foundations */}
          {[0, 1, 2, 3].map(fi => (
            <div key={fi} onClick={(e) => { e.stopPropagation(); clickFoundation(fi); }}>
              <FoundationSlot
                fdn={gs.foundations[fi]} fi={fi} onClick={() => {}}
                landing={lm?.type === 'fdn' && lm.index === fi}
              />
            </div>
          ))}

          {/* Trump ascending */}
          <div onClick={(e) => { e.stopPropagation(); clickFoundation(4); }}>
            <FoundationSlot
              fdn={gs.foundations[4]} fi={4} onClick={() => {}}
              landing={lm?.type === 'fdn' && lm.index === 4}
              dirLabel={gs.trumpsMerged ? '=' : '↑'}
            />
          </div>

          {/* Merge button */}
          {showMerge && (
            <button
              onClick={(e) => { e.stopPropagation(); mergeTrumps(); }}
              style={{
                alignSelf: 'center',
                fontSize: 'clamp(8px, 1.3vw, 11px)',
                fontFamily: '-apple-system, sans-serif',
                background: 'rgba(251,191,36,0.15)',
                color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.3)',
                borderRadius: '8px',
                cursor: 'pointer',
                padding: '4px 8px',
                fontWeight: 600,
                animation: 'glow-pulse 1.5s ease-in-out infinite',
                transition: 'background 0.15s',
              }}
            >
              Fusionner
            </button>
          )}

          {/* Trump descending */}
          {!gs.trumpsMerged && (
            <div onClick={(e) => { e.stopPropagation(); clickFoundation(5); }}>
              <FoundationSlot
                fdn={gs.foundations[5]} fi={5} onClick={() => {}}
                landing={lm?.type === 'fdn' && lm.index === 5}
                dirLabel="↓"
              />
            </div>
          )}
        </div>

        {/* ─── Columns ─────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: '2px' }}>
          {gs.columns.map((col, ci) => (
            <div key={ci} className="relative" style={{ minHeight: colHeight(col) }}
              onClick={(e) => { e.stopPropagation(); clickColumn(ci); }}>
              {col.length === 0 ? (
                <EmptySlot label="" onClick={() => {}} />
              ) : (
                col.map((card, idx) => {
                  const isLast = idx === col.length - 1;
                  const isInSelection = gs.selected?.from === 'col'
                    && gs.selected.index === ci
                    && idx >= gs.selected.cardIndex;
                  return (
                    <div key={card.id} className="absolute left-0"
                      style={{ top: cardTopCss(col, idx), zIndex: idx, width: 'var(--card-w)' }}>
                      {card.faceUp ? (
                        <CardFace
                          card={card}
                          selected={isInSelection}
                          landing={isLast && lm?.type === 'col' && lm.index === ci}
                          appearing={isLast && lm?.type === 'distribute'}
                          appearDelay={ci}
                          onClick={(e) => { e.stopPropagation(); clickCard(ci, idx); }}
                          onDoubleClick={(e) => { e.stopPropagation(); if (isLast) autoPlace(ci); }}
                        />
                      ) : (
                        <CardBack />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>

        {/* ─── Victory ─────────────────────────────────── */}
        {gs.gameOver && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            style={{ backdropFilter: 'blur(8px)' }}>
            <div style={{
              background: 'linear-gradient(135deg, #1f2937, #111827)',
              borderRadius: '16px',
              padding: '32px 40px',
              textAlign: 'center',
              boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 100px rgba(251,191,36,0.1)',
              border: '1px solid rgba(251,191,36,0.2)',
              fontFamily: '-apple-system, sans-serif',
              animation: 'card-land 0.5s ease-out',
              maxWidth: '90vw',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#127881;</div>
              <h2 style={{
                fontSize: '28px', fontWeight: 800, color: '#fbbf24',
                marginBottom: '8px', letterSpacing: '-0.5px',
              }}>
                Victoire !
              </h2>
              <p style={{
                color: 'rgba(255,255,255,0.4)', marginBottom: '24px',
                fontSize: '14px', fontWeight: 500,
              }}>
                Termin&#233; en {gs.moves} coups
              </p>
              <button onClick={restart}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  color: '#1f2937',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px 28px',
                  fontSize: '16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: '-apple-system, sans-serif',
                  transition: 'transform 0.1s',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                Rejouer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
