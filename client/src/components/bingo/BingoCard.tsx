'use client';

import { BingoCardState } from '@/types/game';
import clsx from 'clsx';

const COLUMNS = ['B', 'I', 'N', 'G', 'O'];

interface BingoCardProps {
  card: BingoCardState;
  highlightNumber?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export default function BingoCard({
  card,
  highlightNumber,
  size = 'md',
}: BingoCardProps) {
  const { numbers, openedCells } = card;

  const isCellOpen = (idx: number) => (openedCells & (1 << idx)) !== 0;
  const isFree = (idx: number) => idx === 12; // center cell

  const cellSize = {
    sm: 'w-10 h-10 text-xs',
    md: 'w-14 h-14 text-sm',
    lg: 'w-16 h-16 text-base',
  }[size];

  return (
    <div className="inline-block select-none">
      {/* Column headers */}
      <div className="flex">
        {COLUMNS.map((col) => (
          <div
            key={col}
            className={clsx(
              'flex items-center justify-center font-extrabold text-white bg-blue-600 rounded-t',
              cellSize,
              'mx-0.5',
            )}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Grid rows */}
      {Array.from({ length: 5 }, (_, row) => (
        <div key={row} className="flex">
          {Array.from({ length: 5 }, (_, col) => {
            const idx = row * 5 + col;
            const num = numbers[idx];
            const opened = isCellOpen(idx);
            const free = isFree(idx);
            const isHighlighted = !free && num === highlightNumber;

            return (
              <div
                key={col}
                className={clsx(
                  'flex items-center justify-center font-bold border border-gray-200 rounded mx-0.5 my-0.5 transition-all duration-300',
                  cellSize,
                  opened
                    ? 'bg-blue-500 text-white shadow-inner'
                    : 'bg-white text-gray-800',
                  free && 'bg-yellow-400 text-white',
                  isHighlighted && !opened && 'ring-2 ring-orange-400 bg-orange-50',
                  isHighlighted && opened && 'ring-2 ring-green-400',
                )}
              >
                {free ? '★' : num}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
