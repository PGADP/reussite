'use client';

import { useState, useCallback, useEffect } from 'react';

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
  if (c.kind === 'excuse') return '⚜';
  if (c.kind === 'trump') return String(c.value);
  return VAL_DISPLAY[c.value] ?? String(c.value);
};

const suitSym = (c: Card): string => {
  if (c.kind === 'excuse') return '🃏';
  if (c.kind === 'trump') return '⚜';
  return SUIT_SYM[c.suit!];
};

const textColor = (c: Card): string => {
  if (c.kind === 'excuse') return '#16a34a';
  if (c.kind === 'trump') return '#16a34a';
  return isRed(c) ? '#dc2626' : '#111827';
};

// ═══════════════════════════════════════════════════════════════════
// Game state
// ═══════════════════════════════════════════════════════════════════

interface GameState {
  columns: Card[][];
  foundations: Card[][];
  stock: Card[];
  selected: number | null; // column index or null
  gameOver: boolean;
  moves: number;
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
    foundations: [[], [], [], [], []],
    stock: deck.slice(idx),
    selected: null,
    gameOver: false,
    moves: 0,
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

function canPlaceOnFoundation(card: Card, fi: number, fdn: Card[]): boolean {
  if (fi < 4) {
    // Suit foundation: A → R ascending
    if (card.kind !== 'suit' || card.suit !== SUITS[fi]) return false;
    return fdn.length === 0 ? card.value === 1 : card.value === fdn[fdn.length - 1].value + 1;
  }
  // Trump foundation (index 4) — bidirectional
  if (card.kind === 'trump') {
    if (fdn.length === 0) return card.value === 1 || card.value === 21;
    const first = fdn[0];
    const top = fdn[fdn.length - 1];
    if (top.kind !== 'trump') return false;
    if (first.value === 1) {
      // Ascending: 1 → 21
      return card.value === top.value + 1;
    } else {
      // Descending: 21 → 1
      return card.value === top.value - 1;
    }
  }
  if (card.kind === 'excuse') {
    // Excuse goes last, after all 21 trumps
    return fdn.length === 21;
  }
  return false;
}

function findFoundation(card: Card, foundations: Card[][]): number {
  for (let i = 0; i < 5; i++)
    if (canPlaceOnFoundation(card, i, foundations[i])) return i;
  return -1;
}

function isWin(fdns: Card[][]): boolean {
  return fdns[0].length === 14 && fdns[1].length === 14
    && fdns[2].length === 14 && fdns[3].length === 14
    && fdns[4].length === 22;
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
  };
}

function revealBottom(col: Card[]) {
  if (col.length > 0 && !col[col.length - 1].faceUp)
    col[col.length - 1].faceUp = true;
}

function cardTopCss(col: Card[], idx: number): string {
  const fdi = col.findIndex(c => c.faceUp);
  const fd = fdi < 0 ? col.length : fdi;
  const fdBefore = Math.min(idx, fd);
  const fuBefore = Math.max(0, idx - fd);
  return `calc(${fdBefore} * var(--peek-down) + ${fuBefore} * var(--peek-up))`;
}

function colHeight(col: Card[]): string {
  if (col.length === 0) return 'var(--card-h)';
  const fdi = col.findIndex(c => c.faceUp);
  const fd = fdi < 0 ? col.length : fdi;
  const fu = Math.max(0, col.length - fd - 1);
  return `calc(${fd} * var(--peek-down) + ${fu} * var(--peek-up) + var(--card-h))`;
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

function CardFace({ card, selected, onClick, onDoubleClick }: {
  card: Card;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
}) {
  const color = textColor(card);
  const isExcuse = card.kind === 'excuse';
  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className="cursor-pointer select-none transition-shadow"
      style={{
        width: 'var(--card-w)',
        height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        background: selected ? '#fffbeb' : '#fff',
        border: selected ? '2px solid #f59e0b' : '1px solid #d1d5db',
        boxShadow: selected
          ? '0 0 8px rgba(245,158,11,0.6), 0 2px 4px rgba(0,0,0,0.2)'
          : '0 1px 3px rgba(0,0,0,0.15)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isExcuse ? 'center' : 'flex-start',
        justifyContent: isExcuse ? 'center' : 'flex-start',
        padding: isExcuse ? '0' : 'calc(var(--card-fs) * 0.15)',
        fontFamily: 'Georgia, "Times New Roman", serif',
        color,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {isExcuse ? (
        <div style={{ fontSize: 'var(--card-fs-lg)', lineHeight: 1 }}>
          🃏
        </div>
      ) : (
        <>
          {/* Top-left corner */}
          <div style={{
            fontSize: 'var(--card-fs)',
            fontWeight: 700,
            lineHeight: 1.1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}>
            <span>{displayVal(card)}</span>
            <span style={{ fontSize: 'calc(var(--card-fs) * 0.85)' }}>{suitSym(card)}</span>
          </div>
          {/* Center suit */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 'var(--card-fs-lg)',
            opacity: 0.25,
            lineHeight: 1,
          }}>
            {suitSym(card)}
          </div>
          {/* Bottom-right corner (inverted) */}
          <div style={{
            position: 'absolute',
            bottom: 'calc(var(--card-fs) * 0.15)',
            right: 'calc(var(--card-fs) * 0.15)',
            fontSize: 'var(--card-fs)',
            fontWeight: 700,
            lineHeight: 1.1,
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
    </div>
  );
}

function CardBack({ onClick }: { onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      className="select-none"
      style={{
        width: 'var(--card-w)',
        height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        border: '1px solid #1e3a5f',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        background: `repeating-linear-gradient(
          45deg,
          #1e3a5f,
          #1e3a5f 3px,
          #2a4a7f 3px,
          #2a4a7f 6px
        )`,
        cursor: onClick ? 'pointer' : 'default',
      }}
    />
  );
}

function EmptySlot({ label, onClick }: { label: string; onClick?: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      className="select-none flex items-center justify-center"
      style={{
        width: 'var(--card-w)',
        height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        border: '2px dashed rgba(255,255,255,0.2)',
        color: 'rgba(255,255,255,0.3)',
        fontSize: 'var(--card-fs-lg)',
        fontFamily: 'Georgia, serif',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {label}
    </div>
  );
}

function FoundationSlot({ fdn, fi, onClick }: {
  fdn: Card[];
  fi: number;
  onClick: () => void;
}) {
  const label = fi < 4 ? SUIT_SYM[SUITS[fi]] : '⚜';
  const fdnColor = fi < 4
    ? (fi < 2 ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.3)')
    : 'rgba(22,163,74,0.35)';

  if (fdn.length === 0) {
    return (
      <div
        onClick={onClick}
        className="select-none flex items-center justify-center cursor-pointer"
        style={{
          width: 'var(--card-w)',
          height: 'var(--card-h)',
          borderRadius: 'var(--card-r)',
          border: `2px dashed ${fdnColor}`,
          color: fdnColor,
          fontSize: 'var(--card-fs-lg)',
          fontFamily: 'Georgia, serif',
        }}
      >
        {label}
      </div>
    );
  }

  const topCard = fdn[fdn.length - 1];
  const dirLabel = fi === 4 && fdn.length > 0 && fdn[0].kind === 'trump'
    ? (fdn[0].value === 1 ? '↑' : '↓')
    : null;

  return (
    <div onClick={onClick} className="relative cursor-pointer">
      <CardFace card={topCard} />
      {/* Card count badge */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          bottom: '-2px',
          right: '-2px',
          background: '#065f46',
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
      {/* Direction indicator for trump foundation */}
      {dirLabel && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            top: '-2px',
            left: '-2px',
            background: '#14532d',
            color: '#86efac',
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

  const restart = useCallback(() => setGs(newGameState()), []);

  // ─── Distribute: deal 1 card face-up to each column ──────────
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
      return s;
    });
  }, []);

  // ─── Click column ──────────────────────────────────────────────
  const clickColumn = useCallback((ci: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];

      if (s.selected !== null) {
        // Same column → deselect
        if (s.selected === ci) {
          s.selected = null;
          return s;
        }

        // Get the selected card (bottom of source column)
        const srcCol = s.columns[s.selected];
        const card = srcCol.length > 0 ? srcCol[srcCol.length - 1] : null;

        if (card && canPlaceOnColumn(card, col)) {
          srcCol.pop();
          revealBottom(srcCol);
          col.push(card);
          s.selected = null;
          s.moves++;
          return s;
        }

        // Invalid placement: re-select this column if face-up bottom
        if (col.length > 0 && col[col.length - 1].faceUp) {
          s.selected = ci;
          return s;
        }
        s.selected = null;
        return s;
      }

      // No selection → select bottom card
      if (col.length === 0 || !col[col.length - 1].faceUp) return prev;
      s.selected = ci;
      return s;
    });
  }, []);

  // ─── Click foundation ──────────────────────────────────────────
  const clickFoundation = useCallback((fi: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver || prev.selected === null) return prev;
      const s = cloneGs(prev);
      const sel = s.selected!;

      const srcCol = s.columns[sel];
      const card = srcCol.length > 0 ? srcCol[srcCol.length - 1] : null;

      if (!card || !canPlaceOnFoundation(card, fi, s.foundations[fi])) {
        s.selected = null;
        return s;
      }

      srcCol.pop();
      revealBottom(srcCol);
      s.foundations[fi].push(card);
      s.selected = null;
      s.moves++;
      if (isWin(s.foundations)) s.gameOver = true;
      return s;
    });
  }, []);

  // ─── Double-click auto-place on foundation ─────────────────────
  const autoPlace = useCallback((ci: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];
      const card = col.length > 0 ? col[col.length - 1] : null;
      if (!card) return prev;

      const fi = findFoundation(card, s.foundations);
      if (fi === -1) return prev;

      col.pop();
      revealBottom(col);
      s.foundations[fi].push(card);
      s.selected = null;
      s.moves++;
      if (isWin(s.foundations)) s.gameOver = true;
      return s;
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  if (!mounted || !gs) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: 'radial-gradient(ellipse at center, #1a5c2a 0%, #0d3315 60%, #091f0e 100%)',
        }}
      >
        <p className="text-amber-100/60" style={{ fontFamily: 'Georgia, serif', fontSize: '18px' }}>
          Distribution des cartes...
        </p>
      </div>
    );
  }

  const totalInFoundations = gs.foundations.reduce((sum, f) => sum + f.length, 0);

  return (
    <div
      className="min-h-screen select-none"
      style={{
        background: 'radial-gradient(ellipse at center, #1a5c2a 0%, #0d3315 60%, #091f0e 100%)',
      }}
      onClick={() => {
        if (gs.selected !== null) setGs(prev => prev ? ({ ...cloneGs(prev), selected: null }) : prev);
      }}
    >
      <div
        className="mx-auto px-1 py-2 sm:px-3 sm:py-3 md:px-4"
        style={{ maxWidth: '900px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ─── Header ────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-2 sm:mb-3">
          <div>
            <h1
              className="text-amber-100 font-bold tracking-wide"
              style={{ fontFamily: 'Georgia, serif', fontSize: 'clamp(14px, 3vw, 24px)' }}
            >
              La Réussite
              <span
                className="font-normal ml-1 sm:ml-2 text-amber-200/50"
                style={{ fontSize: 'clamp(10px, 2vw, 14px)' }}
              >
                Solitaire Tarot
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-amber-100/60" style={{ fontSize: 'clamp(10px, 2vw, 14px)' }}>
              {totalInFoundations}/78
            </span>
            <span className="text-amber-100/60" style={{ fontSize: 'clamp(10px, 2vw, 14px)' }}>
              Coups: {gs.moves}
            </span>
            <button
              onClick={restart}
              className="bg-amber-800/80 hover:bg-amber-700 text-amber-100 rounded transition-colors"
              style={{ fontSize: 'clamp(10px, 2vw, 13px)', padding: '4px 10px' }}
            >
              Nouvelle partie
            </button>
          </div>
        </div>

        {/* ─── Top row: Stock + Foundations ────────────────────── */}
        <div className="flex items-start gap-1 sm:gap-2 mb-3 sm:mb-4">
          {/* Stock — click to distribute */}
          <div onClick={(e) => { e.stopPropagation(); distribute(); }}>
            {gs.stock.length > 0 ? (
              <div className="relative">
                <CardBack onClick={() => {}} />
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    bottom: '-2px', right: '-2px',
                    background: '#1e3a5f', color: '#93c5fd',
                    borderRadius: '999px',
                    width: 'calc(var(--card-fs) * 1.3)',
                    height: 'calc(var(--card-fs) * 1.3)',
                    fontSize: 'calc(var(--card-fs) * 0.7)',
                    fontWeight: 700,
                    border: '1px solid #3b82f6',
                  }}
                >
                  {gs.stock.length}
                </div>
              </div>
            ) : (
              <EmptySlot label="" />
            )}
          </div>

          {/* Distribute label */}
          {gs.stock.length > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); distribute(); }}
              className="self-center text-amber-100/70 hover:text-amber-100 transition-colors"
              style={{
                fontSize: 'clamp(9px, 1.5vw, 12px)',
                fontFamily: 'Georgia, serif',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 4px',
              }}
            >
              Distribuer
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Foundations */}
          {[0, 1, 2, 3, 4].map(fi => (
            <div key={fi} onClick={(e) => { e.stopPropagation(); clickFoundation(fi); }}>
              <FoundationSlot fdn={gs.foundations[fi]} fi={fi} onClick={() => {}} />
            </div>
          ))}
        </div>

        {/* ─── Columns ───────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(11, 1fr)',
            gap: '2px',
          }}
        >
          {gs.columns.map((col, ci) => (
            <div
              key={ci}
              className="relative"
              style={{ minHeight: colHeight(col) }}
              onClick={(e) => { e.stopPropagation(); clickColumn(ci); }}
            >
              {col.length === 0 ? (
                <EmptySlot label="" onClick={() => {}} />
              ) : (
                col.map((card, idx) => (
                  <div
                    key={card.id}
                    className="absolute left-0"
                    style={{
                      top: cardTopCss(col, idx),
                      zIndex: idx,
                      width: 'var(--card-w)',
                    }}
                  >
                    {card.faceUp ? (
                      <CardFace
                        card={card}
                        selected={gs.selected === ci && idx === col.length - 1}
                        onClick={(e) => { e.stopPropagation(); clickColumn(ci); }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (idx === col.length - 1) autoPlace(ci);
                        }}
                      />
                    ) : (
                      <CardBack />
                    )}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>

        {/* ─── Victory overlay ────────────────────────────────── */}
        {gs.gameOver && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div
              className="bg-white rounded-xl p-6 sm:p-8 text-center shadow-2xl mx-4"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              <div className="text-4xl sm:text-5xl mb-3">🎉</div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2 text-gray-800">
                Victoire !
              </h2>
              <p className="text-gray-500 mb-5 text-sm sm:text-base">
                Bravo ! Terminé en {gs.moves} coups.
              </p>
              <button
                onClick={restart}
                className="bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-2 rounded-lg text-lg transition-colors"
                style={{ fontFamily: 'Georgia, serif' }}
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
