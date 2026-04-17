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
  roundTypeLabel?: string | null;
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
  roundTypeLabel,
  className,
}: VotePanelProps) {
  return (
    <section
      className={clsx(
        'rounded-2xl animate-slide-up',
        'bg-gradient-to-br from-[#1a0e2e]/95 via-[#150b24]/95 to-[#0f0a1a]/95',
        'border border-purple-500/15',
        'shadow-[0_16px_64px_rgba(0,0,0,0.5)]',
        'backdrop-blur-xl',
        'p-5',
        className,
      )}
    >
      {/* Header area */}
      <div className="mb-5 text-center">
        {/* Round type badge */}
        {roundTypeLabel && (
          <div className="mb-3 flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-500/20 to-violet-500/20 px-3 py-1 text-[11px] font-bold tracking-wide text-purple-300 ring-1 ring-purple-400/20">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.8)]" />
              {roundTypeLabel}
            </span>
          </div>
        )}

        {/* Status */}
        {myVote ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-400 ring-1 ring-emerald-500/20">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            投票済み
          </div>
        ) : (
          <p className="text-xs font-medium tracking-wide text-purple-300/70">
            どちらかを選んでください
          </p>
        )}

        {/* Question */}
        <h2 className="mt-3 text-lg font-bold leading-7 text-white sm:text-xl">
          {question}
        </h2>
      </div>

      {/* Option buttons */}
      <div className="grid grid-cols-2 gap-3">
        {(['A', 'B'] as VoteChoice[]).map((choice) => {
          const label = choice === 'A' ? optionA : optionB;
          const imageUrl = choice === 'A' ? optionAImageUrl : optionBImageUrl;
          const selected = myVote === choice;
          const isA = choice === 'A';

          return (
            <button
              key={choice}
              onClick={() => !disabled && onVote(choice)}
              disabled={disabled}
              className={clsx(
                'group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-300',
                'focus:outline-none',
                selected
                  ? [
                      'border-purple-400/50',
                      'bg-gradient-to-br from-purple-600/90 to-violet-700/90',
                      'text-white',
                      'shadow-[0_0_24px_rgba(139,92,246,0.4)]',
                      'scale-[1.02]',
                    ]
                  : [
                      'border-white/[0.06]',
                      'bg-white/[0.03]',
                      'text-slate-200',
                      'hover:border-purple-400/30 hover:bg-white/[0.06]',
                      'active:scale-[0.97]',
                    ],
                disabled && !selected && 'cursor-not-allowed opacity-40',
              )}
            >
              {/* Subtle gradient accent on each card */}
              {!selected && (
                <div
                  className={clsx(
                    'absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100',
                    isA
                      ? 'bg-gradient-to-br from-blue-500/5 to-transparent'
                      : 'bg-gradient-to-br from-pink-500/5 to-transparent',
                  )}
                />
              )}

              <div className="relative">
                {imageUrl && (
                  <div className="mb-2.5 overflow-hidden rounded-lg ring-1 ring-white/10">
                    <img
                      src={imageUrl}
                      alt={`選択肢 ${choice}`}
                      className="h-24 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                )}
                <span className={clsx(
                  'inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black',
                  selected
                    ? 'bg-white/20 text-white'
                    : isA
                      ? 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/20'
                      : 'bg-pink-500/15 text-pink-300 ring-1 ring-pink-500/20',
                )}>
                  {choice}
                </span>
                <span className="mt-1.5 block text-[15px] font-bold leading-snug">{label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
