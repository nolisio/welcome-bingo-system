'use client';

import { VoteChoice } from '@/types/game';
import clsx from 'clsx';

interface VotePanelProps {
  question: string;
  optionA: string;
  optionB: string;
  myVote: VoteChoice | null;
  disabled: boolean;
  onVote: (choice: VoteChoice) => void;
}

export default function VotePanel({
  question,
  optionA,
  optionB,
  myVote,
  disabled,
  onVote,
}: VotePanelProps) {
  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
      <div className="mb-5 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">今回の投票</p>
        <p className="mt-3 text-lg font-bold leading-7 text-white">{question}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['A', 'B'] as VoteChoice[]).map((choice) => {
          const label = choice === 'A' ? optionA : optionB;
          const selected = myVote === choice;
          return (
            <button
              key={choice}
              onClick={() => !disabled && onVote(choice)}
              disabled={disabled}
              className={clsx(
                'rounded-[1.35rem] border px-4 py-5 text-left transition-all duration-200',
                selected
                  ? 'border-[#690dab] bg-[#690dab] text-white shadow-[0_0_18px_rgba(105,13,171,0.5)] ring-2 ring-[#690dab]/30'
                  : 'border-white/10 bg-[#241630] text-slate-100 hover:border-[#690dab]/40 hover:bg-[#2a1936]',
                disabled && !selected && 'cursor-not-allowed opacity-60',
              )}
            >
              <span className="inline-flex rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-black uppercase tracking-[0.2em]">
                選択肢 {choice}
              </span>
              <span className="mt-4 block text-xl font-black tracking-[-0.02em]">{label}</span>
              <span className="mt-2 block text-sm text-slate-300">
                {selected ? 'この内容で投票済みです。' : 'タップしてこの選択肢に投票します。'}
              </span>
            </button>
          );
        })}
      </div>

      {myVote && (
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-center text-sm text-slate-300">
          <strong>{myVote}</strong> に投票しました。結果を待っています...
        </p>
      )}
    </section>
  );
}
