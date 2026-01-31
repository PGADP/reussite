'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';

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

const textColor = (c: Card): string => {
  if (c.kind === 'excuse') return '#fbbf24';
  if (c.kind === 'trump') return '#fcd34d';
  return isRed(c) ? '#dc2626' : '#1e293b';
};

const cardBg = (c: Card, selected: boolean): string => {
  if (selected) {
    if (c.kind === 'trump') return '#334155';
    if (c.kind === 'excuse') return '#292524';
    return '#fefce8';
  }
  if (c.kind === 'trump') return '#1e293b';
  if (c.kind === 'excuse') return '#1c1917';
  return isRed(c) ? '#ffffff' : '#f8fafc';
};

const cardBorderColor = (c: Card, selected: boolean): string => {
  if (selected) return '#f59e0b';
  if (c.kind === 'trump') return '#475569';
  if (c.kind === 'excuse') return '#78716c';
  return isRed(c) ? '#fecaca' : '#cbd5e1';
};

// Does the column contain a face-up King (value 14)?
function hasVisibleKing(col: Card[]): boolean {
  return col.some(c => c.faceUp && c.kind === 'suit' && c.value === 14);
}

// ═══════════════════════════════════════════════════════════════════
// Game state
// ═══════════════════════════════════════════════════════════════════

interface HintMove {
  fromCol: number;
  fromCardIndex: number;
  toCol: number;
}

interface CheatState {
  hintUsed: boolean;
  slowDistUsed: boolean;
  activeCheat: 'hint' | 'slowDist' | null;
  slowDistMode: boolean;
  slowDistEligible: number[];
  hintMoves: [HintMove, HintMove] | null;
  hintStep: number;
}

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
  cheat: CheatState;
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
    cheat: {
      hintUsed: false,
      slowDistUsed: false,
      activeCheat: null,
      slowDistMode: false,
      slowDistEligible: [],
      hintMoves: null,
      hintStep: 0,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════
// Placement rules
// ═══════════════════════════════════════════════════════════════════

function canPlaceOnColumn(card: Card, col: Card[]): boolean {
  if (card.kind === 'excuse') return col.length > 0;
  if (col.length === 0) return card.kind === 'suit' && card.value === 14;
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

// Find the start index of the movable sequence at the bottom of a column.
// A sequence is a contiguous run of face-up cards where each card could be
// legally placed on the one below it (alternating color for suits, consecutive
// for trumps). Only the entire sequence can be moved — no cutting allowed.
function seqStart(col: Card[]): number {
  if (col.length === 0) return 0;
  let i = col.length - 1;
  while (i > 0) {
    const cur = col[i];
    const prev = col[i - 1];
    if (!cur.faceUp || !prev.faceUp) break;
    // Excuse breaks sequence
    if (cur.kind === 'excuse' || prev.kind === 'excuse') break;
    // Check if cur is a valid continuation of prev
    if (cur.kind === 'trump' && prev.kind === 'trump') {
      if (cur.value !== prev.value - 1) break;
    } else if (cur.kind === 'suit' && prev.kind === 'suit') {
      if (cur.value !== prev.value - 1 || isRed(cur) === isRed(prev)) break;
    } else {
      break; // Mixed trump/suit breaks the sequence
    }
    i--;
  }
  return i;
}

// ═══════════════════════════════════════════════════════════════════
// Cheat: 2-move hint solver
// ═══════════════════════════════════════════════════════════════════

// Simulate a column move (seq from fromCol starting at cardIdx → toCol)
// Returns a new columns array (shallow-cloned) or null if invalid
function simulateColMove(columns: Card[][], fromCol: number, cardIdx: number, toCol: number): Card[][] | null {
  const src = columns[fromCol];
  const dst = columns[toCol];
  if (fromCol === toCol) return null;
  if (cardIdx < 0 || cardIdx >= src.length) return null;
  const card = src[cardIdx];
  if (!card.faceUp) return null;
  if (!canPlaceOnColumn(card, dst)) return null;
  // Clone columns
  const newCols = columns.map(c => [...c]);
  const moved = newCols[fromCol].splice(cardIdx);
  newCols[toCol].push(...moved);
  // Reveal bottom card
  if (newCols[fromCol].length > 0 && !newCols[fromCol][newCols[fromCol].length - 1].faceUp) {
    newCols[fromCol][newCols[fromCol].length - 1] = { ...newCols[fromCol][newCols[fromCol].length - 1], faceUp: true };
  }
  return newCols;
}

// Check if a state has any foundation-placeable card (= "unblocked")
function hasFoundationMove(columns: Card[][], foundations: Card[][], merged: boolean, excuseSlot: Card | null): boolean {
  for (let ci = 0; ci < columns.length; ci++) {
    const col = columns[ci];
    if (col.length === 0) continue;
    const top = col[col.length - 1];
    if (top.kind === 'excuse' && excuseSlot === null) return true;
    if (findFoundation(top, foundations, merged) !== -1) return true;
  }
  return false;
}

// Check if a move reveals a face-down card (= "productive")
function revealsCard(columns: Card[][], fromCol: number, cardIdx: number): boolean {
  if (cardIdx === 0) return false;
  return !columns[fromCol][cardIdx - 1].faceUp;
}

// Find a 2-move sequence that unblocks (leads to a foundation placement or reveals cards)
function findTwoMoveHint(gs: GameState): [HintMove, HintMove] | null {
  const cols = gs.columns;

  // Gather all possible first moves
  type Move = { fromCol: number; cardIdx: number; toCol: number };
  const allMoves: Move[] = [];
  for (let fc = 0; fc < 11; fc++) {
    if (cols[fc].length === 0) continue;
    const ss = seqStart(cols[fc]);
    for (let tc = 0; tc < 11; tc++) {
      if (fc === tc) continue;
      if (canPlaceOnColumn(cols[fc][ss], cols[tc])) {
        allMoves.push({ fromCol: fc, cardIdx: ss, toCol: tc });
      }
    }
  }

  // Try each pair of moves — prefer pairs that lead to a foundation move
  let bestPair: [HintMove, HintMove] | null = null;

  for (const m1 of allMoves) {
    const cols1 = simulateColMove(cols, m1.fromCol, m1.cardIdx, m1.toCol);
    if (!cols1) continue;

    // Check if after first move we already have a foundation move
    if (hasFoundationMove(cols1, gs.foundations, gs.trumpsMerged, gs.excuseSlot)) {
      // Find a second move that is also useful, or just return with a dummy second
      for (const m2 of allMoves) {
        if (m2.fromCol === m1.fromCol && m2.toCol === m1.toCol) continue;
        // Recalc seq start for the new state
        const src2 = cols1[m2.fromCol];
        if (src2.length === 0) continue;
        const ss2 = seqStart(src2);
        if (canPlaceOnColumn(src2[ss2], cols1[m2.toCol])) {
          const cols2 = simulateColMove(cols1, m2.fromCol, ss2, m2.toCol);
          if (cols2 && hasFoundationMove(cols2, gs.foundations, gs.trumpsMerged, gs.excuseSlot)) {
            return [
              { fromCol: m1.fromCol, fromCardIndex: m1.cardIdx, toCol: m1.toCol },
              { fromCol: m2.fromCol, fromCardIndex: ss2, toCol: m2.toCol },
            ];
          }
        }
      }
      // Even with no good second, first move alone unblocks
      // Find any valid second move
      for (let fc = 0; fc < 11; fc++) {
        if (cols1[fc].length === 0) continue;
        const ss2 = seqStart(cols1[fc]);
        for (let tc = 0; tc < 11; tc++) {
          if (fc === tc) continue;
          if (canPlaceOnColumn(cols1[fc][ss2], cols1[tc])) {
            return [
              { fromCol: m1.fromCol, fromCardIndex: m1.cardIdx, toCol: m1.toCol },
              { fromCol: fc, fromCardIndex: ss2, toCol: tc },
            ];
          }
        }
      }
    }

    // Try second moves that reveal cards or lead to foundation
    for (let fc2 = 0; fc2 < 11; fc2++) {
      if (cols1[fc2].length === 0) continue;
      const ss2 = seqStart(cols1[fc2]);
      for (let tc2 = 0; tc2 < 11; tc2++) {
        if (fc2 === tc2) continue;
        const cols2 = simulateColMove(cols1, fc2, ss2, tc2);
        if (!cols2) continue;
        if (hasFoundationMove(cols2, gs.foundations, gs.trumpsMerged, gs.excuseSlot)) {
          return [
            { fromCol: m1.fromCol, fromCardIndex: m1.cardIdx, toCol: m1.toCol },
            { fromCol: fc2, fromCardIndex: ss2, toCol: tc2 },
          ];
        }
        if (!bestPair && (revealsCard(cols1, fc2, ss2) || revealsCard(cols, m1.fromCol, m1.cardIdx))) {
          bestPair = [
            { fromCol: m1.fromCol, fromCardIndex: m1.cardIdx, toCol: m1.toCol },
            { fromCol: fc2, fromCardIndex: ss2, toCol: tc2 },
          ];
        }
      }
    }
  }

  return bestPair;
}

// ═══════════════════════════════════════════════════════════════════
// State helpers
// ═══════════════════════════════════════════════════════════════════

function cloneGs(gs: GameState): GameState {
  return {
    ...gs,
    cheat: { ...gs.cheat, slowDistEligible: [...gs.cheat.slowDistEligible], hintMoves: gs.cheat.hintMoves ? [...gs.cheat.hintMoves] as [HintMove, HintMove] : null },
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

function CardFace({ card, selected, landing, appearing, appearDelay, onClick, onDoubleClick, onTouchStart, onTouchEnd, onPointerDown, onPointerMove, onPointerUp }: {
  card: Card;
  selected?: boolean;
  landing?: boolean;
  appearing?: boolean;
  appearDelay?: number;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
}) {
  const color = textColor(card);
  const bg = cardBg(card, !!selected);
  const border = cardBorderColor(card, !!selected);
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
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="cursor-pointer select-none"
      style={{
        width: 'var(--card-w)', height: 'var(--card-h)',
        borderRadius: 'var(--card-r)',
        background: bg,
        border: `1.5px solid ${border}`,
        boxShadow: selected
          ? '0 0 10px rgba(245,158,11,0.5), 0 4px 8px rgba(0,0,0,0.3)'
          : isTrump || isExcuse
            ? '0 2px 6px rgba(0,0,0,0.4)'
            : '0 1px 4px rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
        alignItems: isExcuse ? 'center' : 'flex-start',
        justifyContent: isExcuse ? 'center' : 'flex-start',
        padding: isExcuse ? '0' : 'calc(var(--card-fs) * 0.2)',
        fontFamily: "'SF Pro Display', 'Inter', -apple-system, sans-serif",
        color,
        overflow: 'hidden', position: 'relative',
        transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        ...animStyle,
      }}
    >
      {isExcuse ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{
            fontSize: 'var(--card-fs-lg)', lineHeight: 1, fontWeight: 800,
            textShadow: '0 0 8px rgba(251,191,36,0.4)',
          }}>?</div>
          <div style={{
            fontSize: 'calc(var(--card-fs) * 0.55)', fontWeight: 700,
            lineHeight: 1.2, letterSpacing: '0.05em',
            textTransform: 'uppercase', opacity: 0.7,
          }}>Excuse</div>
        </div>
      ) : isTrump ? (
        <>
          <div style={{ fontSize: 'var(--card-fs)', fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em' }}>
            {displayVal(card)}
          </div>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 'var(--card-fs-lg)', lineHeight: 1,
            opacity: 0.15, fontWeight: 900, letterSpacing: '-0.03em',
          }}>{displayVal(card)}</div>
          <div style={{
            position: 'absolute', top: 0, left: '15%', right: '15%', height: '1.5px',
            background: 'linear-gradient(90deg, transparent, #fbbf24, transparent)', opacity: 0.4,
          }} />
          <div style={{
            position: 'absolute', bottom: 'calc(var(--card-fs) * 0.2)',
            right: 'calc(var(--card-fs) * 0.25)',
            fontSize: 'var(--card-fs)', fontWeight: 900, lineHeight: 1, transform: 'rotate(180deg)',
          }}>{displayVal(card)}</div>
        </>
      ) : (
        <>
          <div style={{
            fontSize: 'var(--card-fs)', fontWeight: 800, lineHeight: 1.05,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <span>{displayVal(card)}</span>
            <span style={{ fontSize: 'calc(var(--card-fs) * 0.85)' }}>{suitSym(card)}</span>
          </div>
          <div style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 'var(--card-fs-lg)', lineHeight: 1, opacity: 0.2, fontWeight: 700,
          }}>{suitSym(card)}</div>
          <div style={{
            position: 'absolute', bottom: 'calc(var(--card-fs) * 0.2)',
            right: 'calc(var(--card-fs) * 0.2)',
            fontSize: 'var(--card-fs)', fontWeight: 800, lineHeight: 1.05,
            display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'rotate(180deg)',
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
        border: '1.5px solid #334155',
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 50%, #1e293b 100%)',
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative', overflow: 'hidden',
      }}
    >
      <div style={{
        position: 'absolute', inset: '3px',
        borderRadius: 'calc(var(--card-r) - 2px)',
        border: '1px solid rgba(255,255,255,0.06)',
        background: `repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.03) 4px,rgba(255,255,255,0.03) 5px)`,
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
        border: `1.5px dashed ${color ?? 'rgba(255,255,255,0.1)'}`,
        color: color ?? 'rgba(255,255,255,0.2)',
        fontSize: 'var(--card-fs)',
        fontFamily: "'SF Pro Display', -apple-system, sans-serif",
        fontWeight: 700,
        cursor: onClick ? 'pointer' : 'default',
        lineHeight: 1.1, textAlign: 'center', whiteSpace: 'pre-line',
        background: 'rgba(255,255,255,0.02)',
      }}
    >
      {label}
    </div>
  );
}

const FDN_CONFIG: { emptyLabel: string; color: string }[] = [
  { emptyLabel: '♥', color: 'rgba(220,38,38,0.35)' },
  { emptyLabel: '♦', color: 'rgba(220,38,38,0.35)' },
  { emptyLabel: '♣', color: 'rgba(255,255,255,0.2)' },
  { emptyLabel: '♠', color: 'rgba(255,255,255,0.2)' },
  { emptyLabel: '1↑', color: 'rgba(251,191,36,0.3)' },
  { emptyLabel: '21↓', color: 'rgba(251,191,36,0.3)' },
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
      <div
        className="absolute flex items-center justify-center"
        style={{
          bottom: '-3px', right: '-3px',
          background: fi >= 4 ? '#92400e' : '#1e293b',
          color: fi >= 4 ? '#fcd34d' : '#94a3b8',
          borderRadius: '999px',
          width: 'calc(var(--card-fs) * 1.3)',
          height: 'calc(var(--card-fs) * 1.3)',
          fontSize: 'calc(var(--card-fs) * 0.65)',
          fontWeight: 700,
          border: fi >= 4 ? '1px solid #b45309' : '1px solid #475569',
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
        }}
      >
        {fdn.length}
      </div>
      {dirLabel && (
        <div
          className="absolute flex items-center justify-center"
          style={{
            top: '-3px', left: '-3px',
            background: '#92400e', color: '#fcd34d',
            borderRadius: '999px',
            width: 'calc(var(--card-fs) * 1.1)',
            height: 'calc(var(--card-fs) * 1.1)',
            fontSize: 'calc(var(--card-fs) * 0.65)',
            fontWeight: 700, border: '1px solid #b45309',
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

  // Touch drag state for card selection
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  // Drag-and-drop state
  interface DragState {
    from: SelectedSource;
    cards: Card[];
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    offsetX: number;
    offsetY: number;
    dragging: boolean; // true once moved past threshold
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

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

  // ─── Distribute (skip columns containing a face-up King) ───────
  const distribute = useCallback(() => {
    setGs(prev => {
      if (!prev || prev.gameOver || prev.stock.length === 0) return prev;
      const s = cloneGs(prev);
      // Find eligible columns (no visible King anywhere)
      const eligible: number[] = [];
      for (let i = 0; i < 11; i++) {
        if (!hasVisibleKing(s.columns[i])) {
          eligible.push(i);
        }
      }
      const count = Math.min(s.stock.length, eligible.length);
      for (let i = 0; i < count; i++) {
        const card = s.stock.pop()!;
        card.faceUp = true;
        s.columns[eligible[i]].push(card);
      }
      s.selected = null;
      s.lastMove = { type: 'distribute' };
      return s;
    });
  }, []);

  // ─── Click a card in a column ──────────────────────────────────
  const clickCard = useCallback((ci: number, cardIdx: number) => {
    setGs(prev => {
      if (!prev || prev.gameOver) return prev;
      const s = cloneGs(prev);
      const col = s.columns[ci];
      const ss = seqStart(col); // first index of the movable sequence

      if (s.selected !== null) {
        // Clicking the already-selected sequence toggles it off
        if (s.selected.from === 'col' && s.selected.index === ci && s.selected.cardIndex === ss) {
          s.selected = null; s.lastMove = null; return s;
        }
        // Clicking on the same column: re-select this column's sequence (or deselect if not in seq)
        if (s.selected.from === 'col' && s.selected.index === ci) {
          if (col[cardIdx]?.faceUp && cardIdx >= ss) {
            s.selected = { from: 'col', index: ci, cardIndex: ss }; s.lastMove = null; return s;
          }
          s.selected = null; s.lastMove = null; return s;
        }
        // Clicking on a different column: try to place
        const card = getSelectedCard(s);
        if (card && canPlaceOnColumn(card, col)) {
          const moved = removeSelectedCards(s);
          col.push(...moved);
          s.selected = null; s.moves++;
          s.lastMove = { type: 'col', index: ci };
          return s;
        }
        // Placement failed: select this column's sequence instead (if clicked card is in seq)
        if (col[cardIdx]?.faceUp && cardIdx >= ss) {
          s.selected = { from: 'col', index: ci, cardIndex: ss }; s.lastMove = null; return s;
        }
        s.selected = null; s.lastMove = null; return s;
      }
      // No current selection: select the sequence (only if clicked card is in the seq)
      if (!col[cardIdx]?.faceUp || cardIdx < ss) return prev;
      s.selected = { from: 'col', index: ci, cardIndex: ss }; s.lastMove = null;
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
        if (s.selected.from === 'excuse') { s.selected = null; return s; }
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
      if (s.excuseSlot) { s.selected = { from: 'excuse' }; s.lastMove = null; return s; }
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

  // ─── Touch handlers for swipe-to-select ────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, []);

  const handleTouchEnd = useCallback((ci: number, cardIdx: number, isLast: boolean, e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    // If we were dragging, don't process as swipe
    if (dragRef.current?.dragging) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    // Swipe up = auto-place (if last card)
    if (dy < -40 && Math.abs(dx) < 30 && dt < 400 && isLast) {
      e.preventDefault();
      autoPlace(ci);
      return;
    }
  }, [autoPlace]);

  // ─── Drag-and-drop handlers ────────────────────────────────────
  const DRAG_THRESHOLD = 6;

  const handleDragStart = useCallback((
    source: SelectedSource,
    cards: Card[],
    e: React.PointerEvent
  ) => {
    if (!gs || gs.gameOver) return;
    // Only left mouse / touch
    if (e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const state: DragState = {
      from: source,
      cards,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      dragging: false,
    };
    dragRef.current = state;
    setDrag(state);
    e.preventDefault();
  }, [gs]);

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.dragging && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) return;
    d.dragging = true;
    d.currentX = e.clientX;
    d.currentY = e.clientY;
    dragRef.current = { ...d };
    setDrag({ ...d });
    e.preventDefault();
  }, []);

  const dropOnTarget = useCallback((x: number, y: number) => {
    if (!gs) return;
    // Hide drag overlay temporarily to find element underneath
    const overlay = document.getElementById('drag-overlay');
    if (overlay) overlay.style.pointerEvents = 'none';
    // Also hide the drag ghost
    const ghost = document.getElementById('drag-ghost');
    if (ghost) ghost.style.display = 'none';
    const el = document.elementFromPoint(x, y);
    if (overlay) overlay.style.pointerEvents = '';
    if (ghost) ghost.style.display = '';
    if (!el) return;
    // Walk up to find drop target
    let target: HTMLElement | null = el as HTMLElement;
    while (target && !target.dataset.dropTarget) {
      target = target.parentElement;
    }
    if (!target) return;
    const dt = target.dataset.dropTarget!;
    if (dt.startsWith('col-')) {
      const ci = parseInt(dt.slice(4));
      // Try place on column
      const d = dragRef.current!;
      setGs(prev => {
        if (!prev) return prev;
        const s = cloneGs(prev);
        s.selected = d.from;
        const card = getSelectedCard(s);
        if (card && canPlaceOnColumn(card, s.columns[ci])) {
          const moved = removeSelectedCards(s);
          s.columns[ci].push(...moved);
          s.selected = null; s.moves++;
          s.lastMove = { type: 'col', index: ci };
          return s;
        }
        s.selected = null;
        return s;
      });
    } else if (dt.startsWith('fdn-')) {
      const fi = parseInt(dt.slice(4));
      const d = dragRef.current!;
      setGs(prev => {
        if (!prev) return prev;
        const s = cloneGs(prev);
        s.selected = d.from;
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
    } else if (dt === 'excuse') {
      const d = dragRef.current!;
      setGs(prev => {
        if (!prev) return prev;
        const s = cloneGs(prev);
        s.selected = d.from;
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
      });
    }
  }, [gs]);

  const wasDraggingRef = useRef(false);
  const handleDragEnd = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.dragging) {
      dropOnTarget(e.clientX, e.clientY);
      wasDraggingRef.current = true;
      // Reset after a tick so the click event is suppressed
      setTimeout(() => { wasDraggingRef.current = false; }, 0);
    }
    // If not dragging (just a click), let the click handler handle it
    dragRef.current = null;
    setDrag(null);
  }, [dropOnTarget]);

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  if (!mounted || !gs) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg-felt)' }}>
        <p style={{
          color: 'rgba(255,255,255,0.4)',
          fontFamily: "'SF Pro Display', -apple-system, sans-serif",
          fontSize: '16px', fontWeight: 500,
        }}>
          Distribution des cartes...
        </p>
      </div>
    );
  }

  const total = countAllPlaced(gs);
  const lm = gs.lastMove;
  const showMerge = canMergeTrumps(gs);
  const progress = Math.round((total / 78) * 100);

  return (
    <div
      id="drag-overlay"
      className="min-h-screen select-none flex flex-col"
      style={{ background: 'var(--bg-felt)', touchAction: drag ? 'none' : 'manipulation' }}
      onClick={() => {
        if (gs.selected !== null && !dragRef.current?.dragging) setGs(prev => prev ? ({ ...cloneGs(prev), selected: null, lastMove: null }) : prev);
      }}
      onPointerMove={handleDragMove}
      onPointerUp={handleDragEnd}
    >
      <div className="mx-auto px-1 py-1 sm:px-3 sm:py-2 md:px-4 flex flex-col flex-1 w-full"
        style={{ maxWidth: '960px' }} onClick={e => e.stopPropagation()}>

        {/* ─── Header ──────────────────────────────────── */}
        <div className="flex items-center justify-between mb-1 sm:mb-2" style={{ minHeight: '28px' }}>
          <h1 style={{
            fontFamily: "'SF Pro Display', -apple-system, sans-serif",
            fontSize: 'clamp(13px, 3vw, 22px)',
            fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0,
          }}>
            La Reussite
            <span style={{
              fontWeight: 400, marginLeft: '4px',
              color: 'rgba(255,255,255,0.25)', fontSize: 'clamp(9px, 1.8vw, 13px)',
            }}>Tarot</span>
          </h1>
          <div className="flex items-center gap-1 sm:gap-2">
            <div style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'rgba(255,255,255,0.06)', borderRadius: '999px',
              padding: '2px 8px', fontSize: 'clamp(8px, 1.6vw, 12px)',
              color: 'rgba(255,255,255,0.45)',
              fontFamily: "'SF Pro Display', -apple-system, sans-serif", fontWeight: 500,
            }}>
              <span style={{ color: '#fbbf24', fontWeight: 700 }}>{total}</span>/78
              <div style={{
                width: '24px', height: '3px', background: 'rgba(255,255,255,0.1)',
                borderRadius: '2px', overflow: 'hidden',
              }}>
                <div style={{
                  width: `${progress}%`, height: '100%',
                  background: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                  borderRadius: '2px', transition: 'width 0.3s ease-out',
                }} />
              </div>
            </div>
            <span style={{
              fontSize: 'clamp(8px, 1.6vw, 12px)', color: 'rgba(255,255,255,0.3)',
              fontFamily: "'SF Pro Display', -apple-system, sans-serif",
            }}>{gs.moves}</span>
            <button onClick={restart} style={{
              fontSize: 'clamp(8px, 1.6vw, 12px)', padding: '3px 8px',
              background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px',
              cursor: 'pointer', fontFamily: "'SF Pro Display', -apple-system, sans-serif", fontWeight: 500,
            }}>Nouvelle</button>
          </div>
        </div>

        {/* ─── Columns (main area) ─────────────────────── */}
        <div ref={boardRef} style={{
          display: 'grid', gridTemplateColumns: 'repeat(11, 1fr)', gap: '1px',
        }}>
          {gs.columns.map((col, ci) => (
            <div key={ci} className="relative" style={{ minHeight: colHeight(col) }}
              data-drop-target={`col-${ci}`}
              onClick={(e) => { e.stopPropagation(); clickColumn(ci); }}>
              {col.length === 0 ? (
                <EmptySlot label="" onClick={() => {}} />
              ) : (
                (() => {
                const ss = seqStart(col);
                return col.map((card, idx) => {
                  const isLast = idx === col.length - 1;
                  const inSeq = idx >= ss;
                  const isInSelection = gs.selected?.from === 'col'
                    && gs.selected.index === ci
                    && idx >= gs.selected.cardIndex;
                  const isDragSource = drag?.dragging && drag.from.from === 'col'
                    && drag.from.index === ci && idx >= drag.from.cardIndex;
                  return (
                    <div key={card.id} className="absolute left-0"
                      style={{
                        top: cardTopCss(col, idx), zIndex: idx, width: 'var(--card-w)',
                        opacity: isDragSource ? 0.3 : 1,
                      }}>
                      {card.faceUp ? (
                        <CardFace
                          card={card}
                          selected={isInSelection && !drag?.dragging}
                          landing={isLast && lm?.type === 'col' && lm.index === ci}
                          appearing={isLast && lm?.type === 'distribute'}
                          appearDelay={ci}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (wasDraggingRef.current || dragRef.current?.dragging) return;
                            clickCard(ci, idx);
                          }}
                          onDoubleClick={(e) => { e.stopPropagation(); if (isLast) autoPlace(ci); }}
                          onTouchStart={handleTouchStart}
                          onTouchEnd={(e) => handleTouchEnd(ci, idx, isLast, e)}
                          onPointerDown={inSeq ? (e) => {
                            e.stopPropagation();
                            const cards = col.slice(ss);
                            handleDragStart(
                              { from: 'col', index: ci, cardIndex: ss },
                              cards, e
                            );
                          } : undefined}
                        />
                      ) : (
                        <CardBack />
                      )}
                    </div>
                  );
                });
              })()
              )}
            </div>
          ))}
        </div>

        {/* ─── Bottom bar: Stock + Excuse + Foundations ─── */}
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start',
          gap: '2px', marginTop: '6px', paddingBottom: '4px',
        }}>
          {/* Stock */}
          <div onClick={(e) => { e.stopPropagation(); distribute(); }}>
            {gs.stock.length > 0 ? (
              <div className="relative">
                <CardBack onClick={() => {}} />
                <div className="absolute flex items-center justify-center"
                  style={{
                    bottom: '-3px', right: '-3px',
                    background: '#1e293b', color: '#94a3b8',
                    borderRadius: '999px',
                    width: 'calc(var(--card-fs) * 1.3)', height: 'calc(var(--card-fs) * 1.3)',
                    fontSize: 'calc(var(--card-fs) * 0.65)', fontWeight: 700,
                    border: '1px solid #475569',
                    fontFamily: "'SF Pro Display', -apple-system, sans-serif",
                  }}>{gs.stock.length}</div>
              </div>
            ) : (
              <EmptySlot label="" />
            )}
          </div>

          {/* Excuse storage slot */}
          <div data-drop-target="excuse" onClick={(e) => {
            e.stopPropagation();
            if (wasDraggingRef.current) return;
            clickExcuseSlot();
          }}>
            {gs.excuseSlot ? (
              <div className="relative cursor-pointer" style={{
                animation: lm?.type === 'excuse' ? 'fdn-glow 0.6s ease-out' : undefined,
                borderRadius: 'var(--card-r)',
                opacity: drag?.dragging && drag.from.from === 'excuse' ? 0.3 : 1,
              }}>
                <CardFace
                  card={gs.excuseSlot}
                  selected={gs.selected?.from === 'excuse' && !drag?.dragging}
                  landing={lm?.type === 'excuse'}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (gs.excuseSlot) {
                      handleDragStart({ from: 'excuse' }, [gs.excuseSlot], e);
                    }
                  }}
                />
              </div>
            ) : (
              <div
                className="select-none flex flex-col items-center justify-center cursor-pointer"
                style={{
                  width: 'var(--card-w)', height: 'var(--card-h)',
                  borderRadius: 'var(--card-r)',
                  border: '1.5px dashed rgba(251,191,36,0.2)',
                  color: 'rgba(251,191,36,0.3)',
                  fontSize: 'calc(var(--card-fs) * 0.6)',
                  fontFamily: "'SF Pro Display', -apple-system, sans-serif",
                  fontWeight: 600, background: 'rgba(251,191,36,0.03)',
                }}
              >
                <span style={{ fontSize: 'calc(var(--card-fs) * 0.9)', fontWeight: 800 }}>?</span>
                <span>Excuse</span>
              </div>
            )}
          </div>

          <div style={{ flex: 1, minWidth: '2px' }} />

          {/* 4 Suit foundations */}
          {[0, 1, 2, 3].map(fi => (
            <div key={fi} data-drop-target={`fdn-${fi}`} onClick={(e) => { e.stopPropagation(); clickFoundation(fi); }}>
              <FoundationSlot
                fdn={gs.foundations[fi]} fi={fi} onClick={() => {}}
                landing={lm?.type === 'fdn' && lm.index === fi}

              />
            </div>
          ))}

          {/* Trump ascending [4] */}
          <div data-drop-target="fdn-4" onClick={(e) => { e.stopPropagation(); clickFoundation(4); }}>
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
              className="self-center"
              style={{
                fontSize: 'clamp(7px, 1.2vw, 11px)',
                fontFamily: "'SF Pro Display', -apple-system, sans-serif",
                fontWeight: 600,
                background: 'linear-gradient(135deg, #92400e, #b45309)',
                color: '#fcd34d', border: '1px solid #d97706',
                borderRadius: '6px', cursor: 'pointer', padding: '2px 5px',
                animation: 'merge-pulse 1.5s ease-in-out infinite',
              }}
            >Fusionner</button>
          )}

          {/* Trump descending [5] */}
          {!gs.trumpsMerged && (
            <div data-drop-target="fdn-5" onClick={(e) => { e.stopPropagation(); clickFoundation(5); }}>
              <FoundationSlot
                fdn={gs.foundations[5]} fi={5} onClick={() => {}}
                landing={lm?.type === 'fdn' && lm.index === 5}
                dirLabel="↓"

              />
            </div>
          )}
        </div>

        {/* ─── Drag ghost overlay ──────────────────────── */}
        {drag?.dragging && (
          <div id="drag-ghost" style={{
            position: 'fixed', left: 0, top: 0, width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: 1000,
          }}>
            <div style={{
              position: 'absolute',
              left: drag.currentX - drag.offsetX,
              top: drag.currentY - drag.offsetY,
              opacity: 0.9,
              transform: 'rotate(2deg) scale(1.05)',
              filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))',
            }}>
              {drag.cards.map((card, i) => (
                <div key={card.id} style={{
                  position: i === 0 ? 'relative' : 'absolute',
                  top: i === 0 ? 0 : `calc(${i} * var(--peek-up))`,
                  left: 0,
                  zIndex: i,
                }}>
                  <CardFace card={card} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Victory ─────────────────────────────────── */}
        {gs.gameOver && (
          <div className="fixed inset-0 flex items-center justify-center z-50"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
            <div style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px', padding: '28px', textAlign: 'center',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
              fontFamily: "'SF Pro Display', -apple-system, sans-serif",
              animation: 'card-land 0.5s ease-out',
              maxWidth: '320px', margin: '0 16px',
            }}>
              <div style={{ fontSize: '44px', marginBottom: '10px' }}>🎉</div>
              <h2 style={{
                fontSize: '26px', fontWeight: 800, marginBottom: '6px',
                color: '#f8fafc', letterSpacing: '-0.02em',
              }}>Victoire !</h2>
              <p style={{
                color: 'rgba(255,255,255,0.4)', marginBottom: '20px', fontSize: '13px',
              }}>Terminé en {gs.moves} coups</p>
              <button onClick={restart} style={{
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#1e293b', padding: '10px 24px', borderRadius: '10px',
                fontSize: '15px', fontWeight: 700, border: 'none', cursor: 'pointer',
                fontFamily: "'SF Pro Display', -apple-system, sans-serif",
                boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
              }}>Rejouer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
