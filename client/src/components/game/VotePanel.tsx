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
    <div className="bg-white rounded-2xl shadow-lg p-6 w-full max-w-sm mx-auto">
      <p className="text-center text-lg font-semibold text-gray-800 mb-6">{question}</p>
      <div className="flex gap-4">
        {(['A', 'B'] as VoteChoice[]).map((choice) => {
          const label = choice === 'A' ? optionA : optionB;
          const selected = myVote === choice;
          return (
            <button
              key={choice}
              onClick={() => !disabled && onVote(choice)}
              disabled={disabled}
              className={clsx(
                'flex-1 py-4 rounded-xl text-xl font-extrabold transition-all duration-200',
                selected
                  ? 'bg-blue-600 text-white scale-105 shadow-lg'
                  : 'bg-gray-100 text-gray-700 hover:bg-blue-50',
                disabled && !selected && 'opacity-50 cursor-not-allowed',
              )}
            >
              <span className="block text-2xl mb-1">{choice}</span>
              <span className="block text-sm font-medium">{label}</span>
            </button>
          );
        })}
      </div>
      {myVote && (
        <p className="mt-4 text-center text-sm text-gray-500">
          You voted <strong>{myVote}</strong>. Waiting for results…
        </p>
      )}
    </div>
  );
}
