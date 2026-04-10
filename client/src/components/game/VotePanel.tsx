'use client';

import { VoteChoice } from '@/types/game';
import clsx from 'clsx';

interface VotePanelProps {
  question: string;
  optionA: string;
  optionB: string;
  optionAImageUrl?: string | null;
  optionBImageUrl?: string | null;
  myVote: VoteChoice | null;
  disabled: boolean;
  onVote: (choice: VoteChoice) => void;
  className?: string;
}

export default function VotePanel({
  question,
  optionA,
  optionB,
  optionAImageUrl,
  optionBImageUrl,
  myVote,
  disabled,
  onVote,
  className,
}: VotePanelProps) {
  const stage = myVote
    ? {
        label: '投票済み',
        title: '司会が締切るまでお待ちください',
        detail: 'この画面のままで大丈夫です。まもなく結果発表です。',
      }
    : {
        label: '回答受付中',
        title: 'どちらかを1つ選んでください',
        detail: '回答後は自動で待機状態へ切り替わります。投票は1回のみです。',
      };

  return (
    <section
      className={clsx(
        'rounded-[1.75rem] border border-white/10 bg-[#1f122a] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)]',
        className,
      )}
    >
      <div className="mb-5 text-center">
        <p className="text-xs font-semibold tracking-[0.08em] text-[#d8b4fe]">
          {stage.label}
        </p>
        <h2 className="mt-2 text-xl font-bold leading-8 text-white sm:text-2xl">
          {stage.title}
        </h2>
        <p className="mt-3 text-xs font-medium tracking-[0.08em] text-slate-400">
          現在の質問
        </p>
        <h3 className="mt-2 text-xl font-semibold leading-8 text-white sm:text-2xl">
          {question}
        </h3>
        <p className="mt-3 text-sm text-slate-300">
          {stage.detail}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {(['A', 'B'] as VoteChoice[]).map((choice) => {
          const label = choice === 'A' ? optionA : optionB;
          const imageUrl = choice === 'A' ? optionAImageUrl : optionBImageUrl;
          const selected = myVote === choice;

          return (
            <button
              key={choice}
              onClick={() => !disabled && onVote(choice)}
              disabled={disabled}
              className={clsx(
                'rounded-[1.35rem] border px-4 py-5 text-left transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-[#690dab]/40',
                selected
                  ? 'border-[#690dab] bg-[#690dab] text-white shadow-[0_0_18px_rgba(105,13,171,0.5)] ring-2 ring-[#690dab]/30'
                  : 'border-white/10 bg-[#241630] text-slate-100 hover:border-[#690dab]/40 hover:bg-[#2a1936]',
                disabled && !selected && 'cursor-not-allowed opacity-60',
              )}
            >
              {imageUrl && (
                <div className="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-black/10">
                  <img
                    src={imageUrl}
                    alt={`Option ${choice}`}
                    className="h-36 w-full object-cover"
                  />
                </div>
              )}
              <span className="inline-flex rounded-full border border-white/10 bg-black/15 px-3 py-1 text-xs font-semibold tracking-[0.08em]">
                選択肢 {choice}
              </span>
              <span className="mt-4 block text-xl font-semibold">{label}</span>
              <span className="mt-2 block text-sm text-slate-300">
                {selected
                  ? 'この選択肢に投票済みです。'
                  : 'タップしてこの選択肢に投票します。'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-center text-sm text-slate-300">
        {myVote ? (
          <span>司会が締切ると、自動で結果表示へ切り替わります。</span>
        ) : (
          '回答後はそのまま結果発表を待てます。'
        )}
      </div>
    </section>
  );
}
