'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { getSocket } from '@/lib/socket';
import { BingoWinner, PublicGameState } from '@/types/game';

const ROUND_STATUS_LABELS: Record<string, string> = {
  VOTING: '投票中',
  CLOSED: '締切',
  COMPLETED: '結果発表後',
};

function getPhaseTheme(status?: string | null) {
  switch (status) {
    case 'VOTING':
      return {
        background:
          'bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.10),transparent_36%),linear-gradient(135deg,#0b0b12_0%,#17142a_48%,#0d1420_100%)]',
        orbA: 'bg-violet-400/18',
        orbB: 'bg-sky-400/10',
        orbC: 'bg-fuchsia-400/8',
        chip: 'border-violet-200/18 bg-violet-200/10 text-violet-50',
        questionCard: 'border-white/10 bg-white/7',
      };
    case 'CLOSED':
      return {
        background:
          'bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.10),transparent_36%),linear-gradient(135deg,#100c08_0%,#1d1710_48%,#111318_100%)]',
        orbA: 'bg-amber-300/18',
        orbB: 'bg-orange-400/10',
        orbC: 'bg-yellow-300/8',
        chip: 'border-amber-200/18 bg-amber-200/10 text-amber-50',
        questionCard: 'border-amber-200/12 bg-black/18',
      };
    case 'COMPLETED':
      return {
        background:
          'bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.15),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(45,212,191,0.09),transparent_36%),linear-gradient(135deg,#07120f_0%,#0f1a16_48%,#091118_100%)]',
        orbA: 'bg-emerald-300/18',
        orbB: 'bg-teal-300/10',
        orbC: 'bg-cyan-300/8',
        chip: 'border-emerald-200/18 bg-emerald-200/10 text-emerald-50',
        questionCard: 'border-emerald-200/12 bg-black/20',
      };
    default:
      return {
        background:
          'bg-[radial-gradient(circle_at_top_left,rgba(148,163,184,0.12),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.08),transparent_36%),linear-gradient(135deg,#0b0c11_0%,#121722_48%,#0c1119_100%)]',
        orbA: 'bg-slate-300/14',
        orbB: 'bg-indigo-300/8',
        orbC: 'bg-sky-300/6',
        chip: 'border-white/10 bg-white/6 text-slate-100',
        questionCard: 'border-white/10 bg-white/6',
      };
  }
}

function getHalfTone(choice: 'A' | 'B', outcomeChoice: 'A' | 'B' | null, status?: string | null) {
  const isWinner = status === 'COMPLETED' && outcomeChoice === choice;
  const isLoser =
    status === 'COMPLETED' && outcomeChoice != null && outcomeChoice !== choice;

  if (choice === 'A') {
    if (isWinner) {
      return 'bg-[linear-gradient(135deg,rgba(253,164,175,0.9),rgba(251,113,133,0.72),rgba(244,63,94,0.54))]';
    }
    if (isLoser) {
      return 'bg-[linear-gradient(135deg,rgba(83,19,34,0.84),rgba(58,12,24,0.94))]';
    }
    return 'bg-[linear-gradient(135deg,rgba(253,164,175,0.62),rgba(251,113,133,0.44),rgba(244,63,94,0.3))]';
  }

  if (isWinner) {
    return 'bg-[linear-gradient(135deg,rgba(147,197,253,0.9),rgba(96,165,250,0.72),rgba(59,130,246,0.54))]';
  }
  if (isLoser) {
    return 'bg-[linear-gradient(135deg,rgba(20,38,82,0.84),rgba(13,24,56,0.94))]';
  }
  return 'bg-[linear-gradient(135deg,rgba(147,197,253,0.62),rgba(96,165,250,0.44),rgba(59,130,246,0.3))]';
}

export default function ProjectorPage() {
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [bingoEvent, setBingoEvent] = useState<{
    winners: BingoWinner[];
    message: string;
  } | null>(null);
  const bingoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      socket.emit('public:subscribe');
    };
    const onGameState = (data: PublicGameState) => setGameState(data);
    const onBingoWinner = (data: { winners: BingoWinner[]; message: string }) => {
      setBingoEvent(data);
      if (bingoTimeoutRef.current) {
        clearTimeout(bingoTimeoutRef.current);
      }
      bingoTimeoutRef.current = setTimeout(() => setBingoEvent(null), 10000);
    };

    socket.on('connect', onConnect);
    socket.on('game:state', onGameState);
    socket.on('bingo:winner', onBingoWinner);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      if (bingoTimeoutRef.current) {
        clearTimeout(bingoTimeoutRef.current);
        bingoTimeoutRef.current = null;
      }
      socket.off('connect', onConnect);
      socket.off('game:state', onGameState);
      socket.off('bingo:winner', onBingoWinner);
    };
  }, []);

  const currentRound = gameState?.currentRound;
  const currentStatus = currentRound?.status ?? null;
  const isVoting = currentStatus === 'VOTING';
  const isClosed = currentStatus === 'CLOSED';
  const isCompleted = currentStatus === 'COMPLETED';
  const phaseTheme = getPhaseTheme(currentStatus);
  const outcomeChoice: 'A' | 'B' | null =
    currentRound?.bonusRoundType === 'QUIZ'
      ? currentRound.correctChoice ?? null
      : currentRound?.majorityVote ?? null;
  const outcomeLabel =
    currentRound?.bonusRoundType === 'QUIZ' ? '正解' : '多数派';
  const roundChipLabel = currentRound
    ? `第${currentRound.roundNumber}ラウンド`
    : 'ラウンド未開始';
  const statusChipLabel = currentRound
    ? ROUND_STATUS_LABELS[currentRound.status] ?? currentRound.status
    : gameState?.status === 'ACTIVE'
      ? '進行待機中'
      : '開始待機中';
  const waitingTitle =
    gameState?.status === 'ACTIVE' ? '次のラウンドを待っています' : 'ゲーム開始待ちです';
  const waitingDetail =
    gameState?.status === 'ACTIVE'
      ? '司会が次の問題を準備すると、この画面に質問が表示されます。'
      : '開始すると、ここに質問と結果が表示されます。';
  const centerBadgeTitle = isCompleted
    ? '抽選結果'
    : isClosed
      ? '集計中'
      : currentRound?.bonusRoundType === 'QUIZ'
        ? 'クイズ'
        : '回答中';
  const centerBadgeValue =
    isCompleted && currentRound
      ? currentRound.isBonusRound
        ? '★'
        : String(currentRound.drawnNumber ?? '')
      : isClosed
        ? '...'
        : currentRound?.bonusRoundType === 'QUIZ'
          ? '?'
          : 'VS';
  const centerBadgeNote =
    isCompleted && outcomeChoice
      ? `${outcomeLabel} ${outcomeChoice}`
      : isClosed
        ? 'まもなく結果発表'
        : currentRound?.bonusRoundType === 'QUIZ'
          ? '2択クイズ'
          : 'スマホから回答';
  const winnerCount = bingoEvent?.winners.length ?? 0;
  const winnerSubtitle =
    winnerCount <= 1
      ? 'ビンゴ達成者が出ました'
      : `${winnerCount}名のビンゴ達成者が出ました`;

  return (
    <main className="relative h-screen overflow-hidden text-white">
      <div className={clsx('absolute inset-0', phaseTheme.background)} />
      <div className={clsx('absolute -left-20 top-0 h-80 w-80 rounded-full blur-3xl', phaseTheme.orbA)} />
      <div className={clsx('absolute right-0 top-1/4 h-96 w-96 rounded-full blur-3xl', phaseTheme.orbB)} />
      <div className={clsx('absolute bottom-0 left-1/3 h-72 w-72 rounded-full blur-3xl', phaseTheme.orbC)} />
      <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.04)_28%,transparent_52%,rgba(255,255,255,0.03)_76%,transparent_100%)]" />

      {bingoEvent && (
        <div className="absolute inset-0 z-50 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),_transparent_28%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(49,12,77,0.94)_50%,_rgba(8,15,30,0.98))]" />
          <div className="absolute -left-24 top-8 h-72 w-72 rounded-full bg-fuchsia-500/25 blur-3xl" />
          <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-amber-300/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(120deg,transparent_0%,rgba(255,255,255,0.07)_28%,transparent_55%,rgba(255,255,255,0.06)_78%,transparent_100%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[11rem] font-black tracking-[0.28em] text-white/5">
            BINGO
          </div>

          <div className="relative z-10 flex h-full items-center justify-center px-10 py-12">
            <div className="w-full max-w-5xl rounded-[2.5rem] border border-white/15 bg-white/10 p-8 shadow-[0_36px_140px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-xs font-semibold tracking-[0.08em] text-amber-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.85)]" />
                    ビンゴ達成
                  </div>
                  <p className="mt-6 text-7xl font-bold leading-none tracking-[-0.04em] text-white drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)]">
                    ビンゴ！
                  </p>
                  <p className="mt-4 text-2xl font-semibold text-amber-100">
                    {winnerSubtitle}
                  </p>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-200">
                    {bingoEvent.message}
                  </p>
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <p className="text-sm font-semibold tracking-[0.08em] text-slate-300">
                    達成者一覧
                  </p>
                  <div className="mt-4 grid gap-3">
                    {bingoEvent.winners.map((winner, index) => (
                      <div
                        key={winner.id}
                        className="rounded-[1.5rem] border border-white/10 bg-white/10 px-5 py-4 shadow-[0_20px_36px_rgba(0,0,0,0.18)]"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-semibold tracking-[0.08em] text-amber-200">
                              達成者 {index + 1}
                            </p>
                            <p className="mt-2 text-3xl font-bold text-white">
                              {winner.name}
                            </p>
                          </div>
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-2xl font-black text-amber-100">
                            ★
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 mx-auto grid h-full w-full max-w-[96rem] grid-rows-[auto_1fr] gap-6 p-6">
        <div className="flex items-start gap-3">
          <div
            className={clsx(
              'rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.08em] backdrop-blur',
              phaseTheme.chip,
            )}
          >
            {roundChipLabel}
          </div>
          <div
            className={clsx(
              'rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.08em] backdrop-blur',
              phaseTheme.chip,
            )}
          >
            {statusChipLabel}
          </div>
        </div>

        {!currentRound ? (
          <section
            className={clsx(
              'flex min-h-0 flex-col items-center justify-center rounded-[2.25rem] border p-10 text-center shadow-[0_28px_90px_rgba(0,0,0,0.26)] backdrop-blur-xl',
              phaseTheme.questionCard,
            )}
          >
            <div className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm font-semibold tracking-[0.08em] text-slate-100">
              {statusChipLabel}
            </div>
            <p className="mt-6 text-5xl font-bold text-white">{waitingTitle}</p>
            <p className="mt-5 max-w-3xl text-xl leading-9 text-slate-300">{waitingDetail}</p>
          </section>
        ) : (
          <div className="grid min-h-0 grid-rows-[minmax(0,0.4fr)_minmax(0,0.6fr)] gap-6">
            <section
              className={clsx(
                'min-h-0 rounded-[2.25rem] border p-8 shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur-xl',
                phaseTheme.questionCard,
              )}
            >
              {currentRound.questionImageUrl ? (
                <div className="grid h-full min-h-0 grid-cols-[0.9fr_1.1fr] gap-6">
                  <div className="min-h-0 overflow-hidden rounded-[1.75rem] border border-white/10">
                    <img
                      src={currentRound.questionImageUrl}
                      alt="質問画像"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex min-h-0 flex-col justify-center">
                    <p className="text-sm font-semibold tracking-[0.08em] text-white/70">
                      {currentRound.bonusRoundType === 'QUIZ'
                        ? 'ボーナス問題'
                        : currentRound.isBonusRound
                          ? 'ボーナスタイム'
                          : '2択質問'}
                    </p>
                    <h1 className="mt-4 text-[2.3rem] font-bold leading-[1.38] text-white">
                      {currentRound.question}
                    </h1>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold tracking-[0.08em] text-slate-200">
                        投票 {currentRound.voteCount} / {gameState?.participantCount}
                      </span>
                      {isClosed && (
                        <span className="rounded-full border border-amber-200/14 bg-amber-200/10 px-4 py-2 text-sm font-semibold tracking-[0.08em] text-amber-100">
                          まもなく結果発表
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-0 flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold tracking-[0.08em] text-white/70">
                    {currentRound.bonusRoundType === 'QUIZ'
                      ? 'ボーナス問題'
                      : currentRound.isBonusRound
                        ? 'ボーナスタイム'
                        : '2択質問'}
                  </p>
                  <h1 className="mt-6 max-w-5xl text-[2.75rem] font-bold leading-[1.36] text-white">
                    {currentRound.question}
                  </h1>
                  <div className="mt-8 flex flex-wrap justify-center gap-3">
                    <span className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm font-semibold tracking-[0.08em] text-slate-200">
                      投票 {currentRound.voteCount} / {gameState?.participantCount}
                    </span>
                    {isClosed && (
                      <span className="rounded-full border border-amber-200/14 bg-amber-200/10 px-4 py-2 text-sm font-semibold tracking-[0.08em] text-amber-100">
                        まもなく結果発表
                      </span>
                    )}
                  </div>
                </div>
              )}
            </section>

            <section className="relative min-h-0 overflow-hidden rounded-[2.5rem] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur-xl">
              <div className={clsx('absolute inset-y-0 left-0 w-1/2', getHalfTone('A', outcomeChoice, currentStatus))} />
              <div className={clsx('absolute inset-y-0 right-0 w-1/2', getHalfTone('B', outcomeChoice, currentStatus))} />
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/12" />
              <div className="absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),transparent)]" />

              <div className="relative z-10 grid h-full grid-cols-[1fr_18rem_1fr]">
                <div
                  className={clsx(
                    'flex min-h-0 flex-col justify-center px-10 py-8 text-left items-start pr-10 transition-all duration-500',
                    isCompleted && outcomeChoice === 'A' && 'scale-[1.02]',
                    isCompleted && outcomeChoice === 'B' && 'opacity-70 saturate-75',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={clsx(
                      'rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.08em]',
                      isCompleted && outcomeChoice === 'A'
                        ? 'border-white/28 bg-white/20 text-white shadow-[0_0_24px_rgba(255,255,255,0.22)]'
                        : 'border-white/14 bg-black/16 text-white/88',
                    )}>
                      選択肢 A
                    </span>
                    {isCompleted && outcomeChoice === 'A' && (
                      <span className="rounded-full border border-white/28 bg-white px-4 py-2 text-sm font-bold tracking-[0.08em] text-rose-700 shadow-[0_0_28px_rgba(255,255,255,0.35)]">
                        {outcomeLabel}
                      </span>
                    )}
                  </div>
                  {currentRound.optionAImageUrl && (
                    <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/12 bg-black/12 shadow-[0_16px_34px_rgba(0,0,0,0.18)]">
                      <img
                        src={currentRound.optionAImageUrl}
                        alt="Option A"
                        className="h-36 w-full max-w-[17rem] object-cover"
                      />
                    </div>
                  )}
                  <p className={clsx(
                    'mt-8 text-[2.75rem] font-bold leading-[1.26] text-white transition-all duration-500',
                    isCompleted && outcomeChoice === 'A' && 'drop-shadow-[0_10px_30px_rgba(255,255,255,0.2)]',
                    isCompleted && outcomeChoice === 'B' && 'text-white/72',
                  )}>
                    {currentRound.optionA}
                  </p>
                  <p className={clsx(
                    'mt-5 text-base leading-7 transition-colors duration-500',
                    isCompleted && outcomeChoice === 'A'
                      ? 'text-white/92'
                      : isCompleted && outcomeChoice === 'B'
                        ? 'text-white/56'
                        : 'text-white/82',
                  )}>
                    {isVoting
                      ? '回答受付中'
                      : isClosed
                        ? '結果を集計しています'
                        : outcomeChoice === 'A'
                          ? `${outcomeLabel}です`
                          : 'もう一方が優勢でした'}
                  </p>
                </div>

                <div className="relative flex items-center justify-center px-6">
                  <div className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 bg-white/14" />
                  <div className="absolute inset-x-4 inset-y-5 rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),rgba(10,15,30,0.3))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
                  <div className="relative z-10 flex h-56 w-56 flex-col items-center justify-center rounded-full border border-white/20 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.2),rgba(17,24,39,0.88))] shadow-[0_28px_80px_rgba(0,0,0,0.4)]">
                    <p className="text-[13px] font-semibold tracking-[0.08em] text-white/74">
                      {centerBadgeTitle}
                    </p>
                    <p className="mt-4 text-[5.5rem] font-black leading-none text-white drop-shadow-[0_10px_22px_rgba(255,255,255,0.14)]">
                      {centerBadgeValue}
                    </p>
                    <p className="mt-4 text-base font-semibold tracking-[0.08em] text-white/86">
                      {centerBadgeNote}
                    </p>
                  </div>
                </div>

                <div
                  className={clsx(
                    'flex min-h-0 flex-col justify-center px-10 py-8 text-right items-end pl-10 transition-all duration-500',
                    isCompleted && outcomeChoice === 'B' && 'scale-[1.02]',
                    isCompleted && outcomeChoice === 'A' && 'opacity-70 saturate-75',
                  )}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    {isCompleted && outcomeChoice === 'B' && (
                      <span className="rounded-full border border-white/28 bg-white px-4 py-2 text-sm font-bold tracking-[0.08em] text-sky-700 shadow-[0_0_28px_rgba(255,255,255,0.35)]">
                        {outcomeLabel}
                      </span>
                    )}
                    <span className={clsx(
                      'rounded-full border px-4 py-2 text-sm font-semibold tracking-[0.08em]',
                      isCompleted && outcomeChoice === 'B'
                        ? 'border-white/28 bg-white/20 text-white shadow-[0_0_24px_rgba(255,255,255,0.22)]'
                        : 'border-white/14 bg-black/16 text-white/88',
                    )}>
                      選択肢 B
                    </span>
                  </div>
                  {currentRound.optionBImageUrl && (
                    <div className="mt-6 overflow-hidden rounded-[1.5rem] border border-white/12 bg-black/12 shadow-[0_16px_34px_rgba(0,0,0,0.18)]">
                      <img
                        src={currentRound.optionBImageUrl}
                        alt="Option B"
                        className="h-36 w-full max-w-[17rem] object-cover"
                      />
                    </div>
                  )}
                  <p className={clsx(
                    'mt-8 text-[2.75rem] font-bold leading-[1.26] text-white transition-all duration-500',
                    isCompleted && outcomeChoice === 'B' && 'drop-shadow-[0_10px_30px_rgba(255,255,255,0.2)]',
                    isCompleted && outcomeChoice === 'A' && 'text-white/72',
                  )}>
                    {currentRound.optionB}
                  </p>
                  <p className={clsx(
                    'mt-5 text-base leading-7 transition-colors duration-500',
                    isCompleted && outcomeChoice === 'B'
                      ? 'text-white/92'
                      : isCompleted && outcomeChoice === 'A'
                        ? 'text-white/56'
                        : 'text-white/82',
                  )}>
                    {isVoting
                      ? '回答受付中'
                      : isClosed
                        ? '結果を集計しています'
                        : outcomeChoice === 'B'
                          ? `${outcomeLabel}です`
                          : 'もう一方が優勢でした'}
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
