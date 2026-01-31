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
  | { from: 'col'; index: number; cardIndex: number }  // cardIndex = index within column
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
  if (c.kind === 'excuse') return '★';
  if (c.kind === 'trump') return String(c.value);
  return VAL_DISPLAY[c.value] ?? String(c.value);
};

const suitSym = (c: Card): string => {
  if (c.kind === 'excuse') return '★';
  if (c.kind === 'trump') return '★';
  return SUIT_SYM[c.suit!];
};

// Trump & excuse: black text on green bg
const textColor = (c: Card): string => {
  if (c.kind === 'excuse') return '#111827';
  if (c.kind === 'trump') return '#111827';
  return isRed(c) ? '#be123c' : '#1e293b';
};

const cardBg = (c: Card, selected: boolean): string => {
  if (selected) return '#bbf7d0'; // selected green tint
  if (c.kind === 'trump' || c.kind === 'excuse') return '#86efac'; // solid green
  if (isRed(c)) return '#fff5f5';
  return '#f8fafc';
};

const sideStripeColor = (c: Card): string => {
  if (c.kind === 'trump' || c.kind === 'excuse') return '#166534';
  return textColor(c);
};

// ═══════════════════════════════════════════════════════════════════
// Game state — foundations[0..3] suits, [4] trump 1→, [5] trump ←21
// excuseSlot: dedicated storage for l'Excuse
// ═══════════════════════════════════════════════════════════════════

interface GameState {
  columns: Card[][];
  foundations: Card[][]; // 0-3: suits, 4: trump ↑ (1→), 5: trump ↓ (←21)
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

  // Suit foundations [0..3]
  if (fi < 4) {
    if (card.kind !== 'suit' || card.suit !== SUITS[fi]) return false;
    return fdn.length === 0 ? card.value === 1 : card.value === fdn[fdn.length - 1].value + 1;
  }

  // Trump ascending [4]: 1 →
  if (fi === 4) {
    if (card.kind !== 'trump') return false;
    if (merged) return false; // already merged, no more placing
    if (fdn.length === 0) return card.value === 1;
    return card.value === fdn[fdn.length - 1].value + 1;
  }

  // Trump descending [5]: ← 21
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
  // They meet when ascending top + 1 === descending top
  return asc[asc.length - 1].value + 1 === desc[desc.length - 1].value;
}

function countAllPlaced(gs: GameState): number {
  return gs.foundations.reduce((s, f) => s + f.length, 0)
    + (gs.excuseSlot !== null ? 1 : 0);
}

function isWin(gs: GameState): boolean {
  // All 78 cards placed: 4×14 suits + 21 trumps + 1 excuse
  // Suits in foundations, trumps merged in [4], excuse stored
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

// Get the top card of the selected sub-sequence (the card that was clicked)
function getSelectedCard(gs: GameState): Card | null {
  if (!gs.selected) return null;
  if (gs.selected.from === 'excuse') return gs.excuseSlot;
  const col = gs.columns[gs.selected.index];
  const ci = gs.selected.cardIndex;
  return ci < col.length ? col[ci] : null;
}

// Remove the selected sub-sequence from source and return the cards
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
// Card sub-components — improved readability
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
  const isExcuse = card.kind === 'excuse';
  const isTrump = card.kind === 'trump';

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
        border: selected ? '2px solid #f59e0b' : (isTrump || isExcuse) ? '1px solid #16a34a' : '1px solid #d1d5db',
        boxShadow: selected
          ? '0 0 8px rgba(245,158,11,0.6), 0 2px 4px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column',
        alignItems: isExcuse ? 'center' : 'flex-start',
        justifyContent: isExcuse ? 'center' : 'flex-start',
        padding: isExcuse ? '0' : 'calc(var(--card-fs) * 0.2)',
        fontFamily: 'Georgia, "Times New Roman", serif',
        color,
        overflow: 'hidden', position: 'relative',
        transition: 'background 0.15s, border-color 0.15s',
        ...animStyle,
      }}
    >
      {isExcuse ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{
            fontSize: 'var(--card-fs-lg)',
            lineHeight: 1,
          }}>
            ★
          </div>
          <div style={{
            fontSize: 'calc(var(--card-fs) * 0.6)',
            fontWeight: 700,
            lineHeight: 1.2,
          }}>
            Excuse
          </div>
        </div>
      ) : (
        <>
          {/* ── Top-left corner: value + suit ────────── */}
          <div style={{
            fontSize: 'var(--card-fs)',
            fontWeight: 800,
            lineHeight: 1.05,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textShadow: '0 0.5px 0 rgba(0,0,0,0.08)',
          }}>
            <span>{displayVal(card)}</span>
            <span style={{ fontSize: 'calc(var(--card-fs) * 0.9)' }}>{suitSym(card)}</span>
          </div>

          {/* ── Center: prominent display ────────────── */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 'var(--card-fs-lg)',
            lineHeight: 1,
            opacity: isTrump ? 0.2 : 0.3,
            fontWeight: 700,
          }}>
            {isTrump ? displayVal(card) : suitSym(card)}
          </div>

          {/* ── Colored side stripe for quick ID ──────── */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, bottom: 0,
            width: 'calc(var(--card-r) * 0.6)',
            borderRadius: 'var(--card-r) 0 0 var(--card-r)',
            background: sideStripeColor(card),
            opacity: 0.4,
          }} />

          {/* ── Bottom-right corner (inverted) ────────── */}
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
            textShadow: '0 0.5px 0 rgba(0,0,0,0.08)',
          }}>
            <span>{displayVal(card)}</span>
            <span style={{ fontSize: 'calc(var(--card-fs) * 0.9)' }}>{suitSym(card)}</span>
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
        border: '1px solid #1e3a5f',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        background: `repeating-linear-gradient(45deg,#1e3a5f,#1e3a5f 3px,#2a4a7f 3px,#2a4a7f 6px)`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    />
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
        border: `2px dashed ${color ?? 'rgba(255,255,255,0.2)'}`,
        color: color ?? 'rgba(255,255,255,0.3)',
        fontSize: 'var(--card-fs)',
        fontFamily: 'Georgia, serif',
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

// Foundation slot labels and colors
const FDN_CONFIG: { emptyLabel: string; color: string }[] = [
  { emptyLabel: '♥', color: 'rgba(190,18,60,0.3)' },
  { emptyLabel: '♦', color: 'rgba(190,18,60,0.3)' },
  { emptyLabel: '♣', color: 'rgba(255,255,255,0.25)' },
  { emptyLabel: '♠', color: 'rgba(255,255,255,0.25)' },
  { emptyLabel: '1\n★↑', color: 'rgba(22,163,74,0.35)' },
  { emptyLabel: '21\n★↓', color: 'rgba(22,163,74,0.35)' },
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
          bottom: '-2px', right: '-2px',
          background: fi >= 4 ? '#14532d' : '#065f46',
          color: '#a7f3d0',
          borderRadius: '999px',
          width: 'calc(var(--card-fs) * 1.3)',
          height: 'calc(var(--card-fs) * 1.3)',
          fontSize: 'calc(var(--card-fs) * 0.7)',
          fontWeight: 700,
          border: '1px solid #047857',
        }}
      >
        {fdn.length}
      </div>
      {/* Direction badge for trump piles */}
      {dirLabel && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            top: '-2px', left: '-2px',
            background: '#14532d', color: '#86efac',
            borderRadius: '999px',
            width: 'calc(var(--card-fs) * 1.1)',
            height: 'calc(var(--card-fs) * 1.1)',
            fontSize: 'calc(var(--card-fs) * 0.7)',
            fontWeight: 700,
            border: '1px solid #166534',
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

  // ─── Distribute ────────────────────────────────────────────────
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

  // ─── Click a card in a column (supports sub-sequence selection) ──
  const clickCard = useCallback((ci: number, cardIdx: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];

      if (s.selected !== null) {
        // Clicking same column same card => deselect
        if (s.selected.from === 'col' && s.selected.index === ci && s.selected.cardIndex === cardIdx) {
          s.selected = null; s.lastMove = null; return s;
        }
        // Clicking same column different card => re-select within same column
        if (s.selected.from === 'col' && s.selected.index === ci) {
          if (col[cardIdx]?.faceUp) {
            s.selected = { from: 'col', index: ci, cardIndex: cardIdx }; s.lastMove = null; return s;
          }
          s.selected = null; s.lastMove = null; return s;
        }

        // Try to place the selected sub-sequence on this column
        const card = getSelectedCard(s);
        if (card && canPlaceOnColumn(card, col)) {
          const moved = removeSelectedCards(s);
          col.push(...moved);
          s.selected = null; s.moves++;
          s.lastMove = { type: 'col', index: ci };
          return s;
        }

        // Click another column with face-up card => re-select
        if (col[cardIdx]?.faceUp) {
          s.selected = { from: 'col', index: ci, cardIndex: cardIdx }; s.lastMove = null; return s;
        }
        s.selected = null; s.lastMove = null; return s;
      }

      // Nothing selected => select this card (and everything below it)
      if (!col[cardIdx]?.faceUp) return prev;
      s.selected = { from: 'col', index: ci, cardIndex: cardIdx }; s.lastMove = null;
      return s;
    });
  }, []);

  // ─── Click empty column ────────────────────────────────────────
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

  // ─── Click foundation ──────────────────────────────────────────
  const clickFoundation = useCallback((fi: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver || prev.selected === null) return prev;
      const s = cloneGs(prev);
      const card = getSelectedCard(s);
      // Only single cards can go to foundations (not sub-sequences)
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

  // ─── Click excuse slot ──────────────────────────────────────────
  const clickExcuseSlot = useCallback(() => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);

      // Something selected => try to store it in excuse slot
      if (s.selected !== null) {
        // If already selected from excuse, deselect
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

      // Nothing selected => pick up excuse from slot
      if (s.excuseSlot) {
        s.selected = { from: 'excuse' }; s.lastMove = null;
        return s;
      }

      return prev;
    });
  }, []);

  // ─── Merge trump piles ──────────────────────────────────────────
  const mergeTrumps = useCallback(() => {
    setGs(prev => {
      if (!prev || prev.gameOver || !canMergeTrumps(prev)) return prev;
      const s = cloneGs(prev);
      // Merge descending into ascending: [1..N] + reversed [21..N+1] = [1..21]
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

  // ─── Double-click auto-place ───────────────────────────────────
  const autoPlace = useCallback((ci: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];
      const card = col.length > 0 ? col[col.length - 1] : null;
      if (!card) return prev;

      // Auto-store excuse in slot
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
        style={{ background: 'radial-gradient(ellipse at center, #1a5c2a 0%, #0d3315 60%, #091f0e 100%)' }}>
        <p className="text-amber-100/60" style={{ fontFamily: 'Georgia, serif', fontSize: '18px' }}>
          Distribution des cartes...
        </p>
      </div>
    );
  }

  const total = countAllPlaced(gs);
  const lm = gs.lastMove;
  const showMerge = canMergeTrumps(gs);

  return (
    <div
      className="min-h-screen select-none"
      style={{ background: 'radial-gradient(ellipse at center, #1a5c2a 0%, #0d3315 60%, #091f0e 100%)' }}
      onClick={() => {
        if (gs.selected !== null) setGs(prev => prev ? ({ ...cloneGs(prev), selected: null, lastMove: null }) : prev);
      }}
    >
      <div className="mx-auto px-1 py-2 sm:px-3 sm:py-3 md:px-4"
        style={{ maxWidth: '960px' }} onClick={e => e.stopPropagation()}>

        {/* ─── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <h1 className="text-amber-100 font-bold tracking-wide"
            style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(14px, 3vw, 24px)' }}>
            La Réussite
            <span className="font-normal ml-1 sm:ml-2 text-amber-200/50"
              style={{ fontSize: 'clamp(10px, 2vw, 14px)' }}>
              Solitaire Tarot
            </span>
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-amber-100/60" style={{ fontSize: 'clamp(10px, 2vw, 14px)' }}>
              {total}/78
            </span>
            <span className="text-amber-100/60" style={{ fontSize: 'clamp(10px, 2vw, 14px)' }}>
              Coups: {gs.moves}
            </span>
            <button onClick={restart}
              className="bg-amber-800/80 hover:bg-amber-700 text-amber-100 rounded transition-colors"
              style={{ fontSize: 'clamp(10px, 2vw, 13px)', padding: '4px 10px' }}>
              Nouvelle partie
            </button>
          </div>
        </div>

        {/* ─── Top row: Stock + Excuse + Foundations ──── */}
        <div className="flex items-start gap-1 sm:gap-2 mb-3 sm:mb-4 flex-wrap">
          {/* Stock */}
          <div onClick={(e) => { e.stopPropagation(); distribute(); }}>
            {gs.stock.length > 0 ? (
              <div className="relative">
                <CardBack onClick={() => {}} />
                <div className="absolute flex items-center justify-center"
                  style={{
                    bottom: '-2px', right: '-2px',
                    background: '#1e3a5f', color: '#93c5fd',
                    borderRadius: '999px',
                    width: 'calc(var(--card-fs) * 1.3)', height: 'calc(var(--card-fs) * 1.3)',
                    fontSize: 'calc(var(--card-fs) * 0.7)', fontWeight: 700,
                    border: '1px solid #3b82f6',
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
              className="self-center text-amber-100/70 hover:text-amber-100 transition-colors"
              style={{
                fontSize: 'clamp(8px, 1.3vw, 12px)', fontFamily: 'Georgia, serif',
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
              }}>
              Distribuer
            </button>
          )}

          {/* Excuse storage slot */}
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
                onClick={() => {}}
                className="select-none flex flex-col items-center justify-center cursor-pointer"
                style={{
                  width: 'var(--card-w)', height: 'var(--card-h)',
                  borderRadius: 'var(--card-r)',
                  border: '2px dashed rgba(134,239,172,0.25)',
                  color: 'rgba(134,239,172,0.35)',
                  fontSize: 'calc(var(--card-fs) * 0.7)',
                  fontFamily: 'Georgia, serif',
                }}
              >
                <span style={{ fontSize: 'var(--card-fs)' }}>★</span>
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

          {/* Trump ascending [4]: 1→ */}
          <div onClick={(e) => { e.stopPropagation(); clickFoundation(4); }}>
            <FoundationSlot
              fdn={gs.foundations[4]} fi={4} onClick={() => {}}
              landing={lm?.type === 'fdn' && lm.index === 4}
              dirLabel={gs.trumpsMerged ? '✓' : '↑'}
            />
          </div>

          {/* Merge button */}
          {showMerge && (
            <button
              onClick={(e) => { e.stopPropagation(); mergeTrumps(); }}
              className="self-center transition-colors"
              style={{
                fontSize: 'clamp(8px, 1.3vw, 11px)',
                fontFamily: 'Georgia, serif',
                background: '#065f46',
                color: '#a7f3d0',
                border: '1px solid #047857',
                borderRadius: '6px',
                cursor: 'pointer',
                padding: '3px 5px',
                animation: 'glow-pulse 1.5s ease-in-out infinite',
              }}
            >
              Fusionner
            </button>
          )}

          {/* Trump descending [5]: ←21 */}
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
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 sm:p-8 text-center shadow-2xl mx-4"
              style={{ fontFamily: 'Georgia, serif', animation: 'card-land 0.5s ease-out' }}>
              <div className="text-4xl sm:text-5xl mb-3">🎉</div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-800">Victoire !</h2>
              <p className="text-gray-500 mb-5 text-sm sm:text-base">
                Bravo ! Terminé en {gs.moves} coups.
              </p>
              <button onClick={restart}
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg text-lg transition-colors"
                style={{ fontFamily: 'Georgia, serif' }}>
                Rejouer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
