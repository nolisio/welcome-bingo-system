'use client';

import { BingoCardState } from '@/types/game';
import clsx from 'clsx';

const COLUMNS = ['B', 'I', 'N', 'G', 'O'];

interface BingoCardProps {
  card: BingoCardState;
  highlightNumber?: number | null;
  size?: 'sm' | 'md' | 'lg';
  selectableCellIndexes?: number[];
  selectedCellIndex?: number | null;
  onCellClick?: (cellIndex: number) => void;
}

export default function BingoCard({
  card,
  highlightNumber,
  size = 'md',
  selectableCellIndexes = [],
  selectedCellIndex = null,
  onCellClick,
}: BingoCardProps) {
  const { numbers, openedCells } = card;
  const selectableSet = new Set(selectableCellIndexes);
  const selectedNumber = selectedCellIndex != null ? numbers[selectedCellIndex] : null;

  const isCellOpen = (idx: number) => (openedCells & (1 << idx)) !== 0;

  const styles = {
    sm: {
      shell: 'rounded-2xl p-2',
      wrapper: 'gap-[3px]',
      headers: 'text-sm font-black',
      cell: 'text-xs sm:text-sm rounded-lg',
    },
    md: {
      shell: 'rounded-2xl p-3',
      wrapper: 'gap-1',
      headers: 'text-base font-black',
      cell: 'text-base rounded-xl',
    },
    lg: {
      shell: 'rounded-3xl p-4',
      wrapper: 'gap-1.5',
      headers: 'text-lg font-black',
      cell: 'text-lg rounded-xl',
    },
  }[size];

  return (
    <div
      className={clsx(
        'w-full select-none',
        'bg-gradient-to-br from-purple-950/80 via-[#1a0e2e]/90 to-indigo-950/80',
        'border border-purple-500/20',
        'shadow-[0_8px_40px_rgba(139,92,246,0.15),0_0_0_1px_rgba(139,92,246,0.05)]',
        styles.shell,
      )}
    >
      {/* Column headers */}
      <div className={clsx('mb-1.5 grid grid-cols-5', styles.wrapper)}>
        {COLUMNS.map((col) => (
          <div
            key={col}
            className={clsx(
              'text-center tracking-wider',
              'bg-gradient-to-b from-purple-300 to-purple-400 bg-clip-text text-transparent',
              styles.headers,
            )}
          >
            {col}
          </div>
        ))}
      </div>

      {/* 5x5 grid */}
      <div className={clsx('grid aspect-square grid-cols-5', styles.wrapper)}>
        {Array.from({ length: 25 }, (_, idx) => {
          const num = numbers[idx];
          const opened = isCellOpen(idx);
          const isHighlighted = num === highlightNumber;
          const isSelectable = selectableSet.has(idx) && !opened;
          const isSelected = selectedCellIndex === idx;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (isSelectable && onCellClick) {
                  onCellClick(idx);
                }
              }}
              disabled={!isSelectable}
              className={clsx(
                'flex aspect-square items-center justify-center border text-center font-bold transition-all duration-300',
                styles.cell,
                // Interaction
                isSelectable && 'cursor-pointer active:scale-95 hover:scale-[1.03]',
                !isSelectable && 'cursor-default',
                // State: opened
                opened && !isHighlighted &&
                  'border-purple-500/50 bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-[0_0_16px_rgba(139,92,246,0.4)]',
                // State: opened + highlighted (just drawn & matched)
                opened && isHighlighted &&
                  'border-emerald-400/60 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_0_20px_rgba(52,211,153,0.5)] animate-ring-pulse',
                // State: closed default
                !opened && !isHighlighted && !isSelectable && !isSelected &&
                  'border-white/[0.06] bg-white/[0.03] text-slate-300',
                // State: highlighted but not opened
                isHighlighted && !opened && !isSelectable && !isSelected &&
                  'border-purple-400/50 bg-purple-500/15 text-white ring-1 ring-purple-400/30 animate-ring-pulse',
                // State: selectable (bonus)
                isSelectable && !isSelected &&
                  'border-amber-400/50 bg-amber-400/10 text-amber-100 ring-1 ring-amber-400/20 hover:bg-amber-400/20',
                // State: selected (bonus chosen)
                isSelected &&
                  'border-emerald-400/70 bg-emerald-500/20 text-white ring-2 ring-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]',
              )}
            >
              {num}
            </button>
          );
        })}
      </div>

      {/* Bonus selection indicator */}
      {selectedNumber != null && selectableCellIndexes.length > 0 && (
        <div className="mt-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-center animate-slide-up">
          <p className="text-xs font-semibold text-emerald-300">
            {selectedNumber}番を開けます
          </p>
        </div>
      )}
    </div>
  );
}
