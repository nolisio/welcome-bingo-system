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

  const styles = {
    sm: {
      wrapper: 'gap-1',
      headers: 'text-xl',
      cell: 'text-sm',
      free: 'text-[9px]',
    },
    md: {
      wrapper: 'gap-1.5',
      headers: 'text-2xl',
      cell: 'text-lg',
      free: 'text-[10px]',
    },
    lg: {
      wrapper: 'gap-2',
      headers: 'text-[2rem]',
      cell: 'text-xl',
      free: 'text-xs',
    },
  }[size];

  return (
    <div className="w-full select-none rounded-[1.5rem] border-4 border-[#690dab]/30 bg-[#690dab]/10 p-3 shadow-[0_24px_70px_rgba(105,13,171,0.28)]">
      <div className={clsx('mb-2 grid grid-cols-5', styles.wrapper)}>
        {COLUMNS.map((col) => (
          <div
            key={col}
            className={clsx(
              'text-center font-black text-[#c084fc] drop-shadow-sm',
              styles.headers,
            )}
          >
            {col}
          </div>
        ))}
      </div>

      <div className={clsx('grid aspect-square grid-cols-5', styles.wrapper)}>
        {Array.from({ length: 25 }, (_, idx) => {
          const num = numbers[idx];
          const opened = isCellOpen(idx);
          const free = isFree(idx);
          const isHighlighted = !free && num === highlightNumber;

          return (
            <div
              key={idx}
              className={clsx(
                'flex aspect-square items-center justify-center rounded-xl border text-center font-bold transition-all duration-300',
                styles.cell,
                opened
                  ? 'border-[#690dab] bg-[#690dab] text-white shadow-[0_0_18px_rgba(105,13,171,0.55)] ring-2 ring-[#690dab]/30'
                  : 'border-white/10 bg-[#241630] text-slate-200',
                free &&
                  'flex-col border-dashed border-[#c084fc]/60 bg-[#690dab]/20 font-black text-[#d8b4fe]',
                isHighlighted &&
                  !opened &&
                  'border-[#c084fc]/60 bg-[#31203d] text-white ring-2 ring-[#690dab]/35',
                isHighlighted &&
                  opened &&
                  'ring-2 ring-emerald-400/80 shadow-[0_0_22px_rgba(52,211,153,0.35)]',
              )}
            >
              {free ? (
                <>
                  <span className="text-base leading-none">★</span>
                  <span className={clsx('mt-1 block font-black tracking-[0.12em]', styles.free)}>
                    フリー
                  </span>
                </>
              ) : (
                num
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
