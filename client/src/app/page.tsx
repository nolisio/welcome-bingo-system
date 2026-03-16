'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { getSocket } from '@/lib/socket';
import {
  BingoWinner,
  ParticipantRound,
  ParticipantState,
  VoteChoice,
} from '@/types/game';
import BingoCard from '@/components/bingo/BingoCard';
import VotePanel from '@/components/game/VotePanel';

const SESSION_KEY = 'bingo_session';

const BINGO_LINES = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function isCellOpen(openedCells: number, idx: number) {
  return idx === 12 || (openedCells & (1 << idx)) !== 0;
}

function countOpenedCells(openedCells: number) {
  return Array.from({ length: 25 }, (_, idx) => idx).filter((idx) =>
    isCellOpen(openedCells, idx),
  ).length;
}

function getCellsToBingo(openedCells: number) {
  return Math.min(
    ...BINGO_LINES.map(
      (line) => line.filter((idx) => !isCellOpen(openedCells, idx)).length,
    ),
  );
}

function getBannerCopy(
  round: ParticipantRound | null,
  currentVote: VoteChoice | null,
  myCardHasDrawn: boolean,
  iCellOpener: boolean,
) {
  if (!round) {
    return {
      eyebrow: '待機中',
      title: '次のラウンドを待っています',
      subtitle: 'カードの準備は完了しています。画面は自動で更新されます。',
      tone: 'border-white/10 bg-white/5 text-slate-100',
      icon: '○',
    };
  }

  if (round.status === 'VOTING') {
    return {
      eyebrow: '投票受付中',
      title: currentVote ? '投票を受け付けました' : 'どちらかを選んでください',
      subtitle: currentVote
        ? `${currentVote} に投票しました。ほかの参加者の投票を待っています。`
        : round.question,
      tone: 'border-[#690dab]/30 bg-[#690dab]/10 text-[#d8b4fe]',
      icon: '◔',
    };
  }

  if (round.status === 'COMPLETED') {
    return {
      eyebrow: 'ラウンド終了',
      title: round.drawnNumber != null ? `${round.drawnNumber} 番が確定しました` : '結果が確定しました',
      subtitle: iCellOpener
        ? 'あなたの投票でこのマスが開きました。'
        : myCardHasDrawn
        ? '公開された番号があなたのカードにあります。'
        : 'このラウンドでビンゴに近づいたか、カードを確認してください。',
      tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
      icon: '✓',
    };
  }

  return {
    eyebrow: '集計中',
    title: '投票結果を集計しています',
    subtitle: '結果の確定と盤面の更新を少しお待ちください。',
    tone: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
    icon: '◌',
  };
}

function Shell({
  title,
  subtitle,
  right,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#12091c] text-slate-100">
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col overflow-hidden border-x border-[#690dab]/10 bg-[#1a1022] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#1a1022]/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#c084fc]">
              ようこそビンゴ
              </p>
            <h1 className="truncate text-lg font-extrabold tracking-[-0.02em] text-white">
              {title}
            </h1>
            <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
          </div>
          {right && <div className="ml-4 shrink-0">{right}</div>}
        </header>

        {children}

        {footer && (
          <footer className="border-t border-white/10 bg-[#140a1c]/95 px-4 pb-6 pt-4 backdrop-blur">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export default function ParticipantPage() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<ParticipantState | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [bingoAnnouncement, setBingoAnnouncement] = useState<string | null>(null);
  const bingoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      const sessionId = getOrCreateSessionId();
      const storedName = localStorage.getItem('bingo_name');
      if (storedName) {
        socket.emit('participant:reconnect', { sessionId }, (res: any) => {
          if (res?.ok) {
            setJoined(true);
          }
        });
      }
    };

    const onDisconnect = () => setConnected(false);

    const onParticipantState = (data: ParticipantState) => {
      setState(data);
    };

    const onBingoWinner = (data: { winners: BingoWinner[]; message: string }) => {
      setBingoAnnouncement(data.message);
      if (bingoTimerRef.current) clearTimeout(bingoTimerRef.current);
      bingoTimerRef.current = setTimeout(() => setBingoAnnouncement(null), 8000);
    };

    const onGameReset = () => {
      setJoined(false);
      setState(null);
      setBingoAnnouncement(null);
      localStorage.removeItem('bingo_name');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('participant:state', onParticipantState);
    socket.on('bingo:winner', onBingoWinner);
    socket.on('game:reset', onGameReset);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('participant:state', onParticipantState);
      socket.off('bingo:winner', onBingoWinner);
      socket.off('game:reset', onGameReset);
      if (bingoTimerRef.current) clearTimeout(bingoTimerRef.current);
    };
  }, []);

  const handleJoin = () => {
    if (!name.trim()) {
      setError('名前を入力してください');
      return;
    }

    const socket = getSocket();
    const sessionId = getOrCreateSessionId();
    localStorage.setItem('bingo_name', name.trim());
    socket.emit(
      'participant:join',
      { name: name.trim(), sessionId },
      (res: any) => {
        if (res?.ok) {
          setJoined(true);
          setError('');
        } else {
          setError(res?.error || '参加に失敗しました');
        }
      },
    );
  };

  const handleVote = (choice: VoteChoice) => {
    const socket = getSocket();
    socket.emit('vote:submit', { choice }, (res: any) => {
      if (!res?.ok) setError(res?.error || '投票に失敗しました');
    });
  };

  if (!joined) {
    return (
      <Shell
        title="ビンゴダッシュボード"
        subtitle={connected ? 'ゲームに参加できます。' : 'ゲームサーバーに接続しています...'}
        right={
          <div
            className={clsx(
              'rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.2em]',
              connected
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-white/10 bg-white/5 text-slate-400',
            )}
          >
            {connected ? '接続中' : '同期中'}
          </div>
        }
      >
        <main className="flex flex-1 flex-col justify-center px-6 py-8">
          <div className="rounded-[1.75rem] border border-[#690dab]/20 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-6 inline-flex rounded-full border border-[#690dab]/30 bg-[#690dab]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[#d8b4fe]">
              参加受付
            </div>
            <h2 className="text-3xl font-extrabold tracking-[-0.03em] text-white">
              ビンゴに参加する
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              名前を入力すると、あなた専用のビンゴカードが配られます。ゲームの進行や再接続の挙動はこれまでと同じです。
            </p>

            <label className="mt-8 block text-xs font-bold uppercase tracking-[0.22em] text-slate-400">
              表示名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="名前を入力"
              className="mt-3 w-full rounded-2xl border border-white/10 bg-[#241630] px-4 py-4 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-[#690dab] focus:ring-2 focus:ring-[#690dab]/30"
              maxLength={40}
            />

            {error && (
              <p className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            )}

            <button
              onClick={handleJoin}
              disabled={!connected}
              className="mt-6 flex w-full items-center justify-center rounded-2xl border-b-4 border-black/20 bg-[#690dab] px-4 py-4 text-base font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_30px_rgba(105,13,171,0.4)] transition hover:bg-[#7a18c1] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            >
              {connected ? 'ゲームに参加' : '接続中...'}
            </button>
          </div>
        </main>
      </Shell>
    );
  }

  if (!state) {
    return (
      <Shell
        title="ビンゴダッシュボード"
        subtitle="カードを準備し、最新の状態を復元しています。"
        right={
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
            読み込み中
          </div>
        }
      >
        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="w-full rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#690dab]/25 border-t-[#690dab]" />
            <p className="mt-5 text-lg font-bold text-white">カードを読み込んでいます...</p>
            <p className="mt-2 text-sm text-slate-400">参加者の最新状態を同期しています。</p>
          </div>
        </main>
      </Shell>
    );
  }

  const round = state.currentRound;
  const isVoting = round?.status === 'VOTING';
  const isCompleted = round?.status === 'COMPLETED';
  const myCardHasDrawn =
    round?.drawnNumber != null && state.card.numbers.includes(round.drawnNumber);
  const iCellOpener = round?.cellOpeners.includes(state.id) ?? false;
  const openedCount = countOpenedCells(state.card.openedCells);
  const cellsToBingo = getCellsToBingo(state.card.openedCells);
  const banner = getBannerCopy(round, state.currentVote, myCardHasDrawn, iCellOpener);
  const resultLabel =
    round?.majorityVote === 'A' ? round.optionA : round?.majorityVote === 'B' ? round.optionB : null;

  return (
    <Shell
      title="ビンゴダッシュボード"
      subtitle={`${state.name} さんとして参加中`}
      right={
        <div className="space-y-2 text-right">
          <div
            className={clsx(
              'inline-flex rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em]',
              connected
                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                : 'border-rose-400/30 bg-rose-400/10 text-rose-200',
            )}
          >
            {connected ? '接続中' : '未接続'}
          </div>
          {state.hasBingo && (
            <div className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
              ビンゴ
            </div>
          )}
        </div>
      }
      footer={
        <div className="space-y-3">
          <div className="rounded-[1.25rem] border border-[#690dab]/25 bg-[#690dab]/15 px-4 py-4 shadow-[0_12px_30px_rgba(105,13,171,0.22)]">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#d8b4fe]">
              現在の状況
            </p>
            <p className="mt-2 text-lg font-black tracking-[-0.02em] text-white">
              {state.hasBingo
                ? 'すでにビンゴ達成です！'
                : isVoting
                ? state.currentVote
                  ? '投票済みです。結果公開を待っています。'
                  : 'ラウンドを進めるために投票してください。'
                : cellsToBingo === 1
                ? 'あと1マスでビンゴです。'
                : `あと${cellsToBingo}マスでビンゴです。`}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {state.hasBingo
                ? 'ほかの参加者の盤面がそろうまで、このままお待ちください。'
                : myCardHasDrawn
                ? '最新の公開番号があなたのカードにありました。'
                : '新しいラウンドが始まると、この表示は自動で更新されます。'}
            </p>
          </div>

          {error && (
            <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          )}
        </div>
      }
    >
      {bingoAnnouncement && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/35 px-6">
          <div className="w-full rounded-[1.75rem] border border-amber-300/30 bg-[#2a1830] px-6 py-7 text-center shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-amber-200">
              お知らせ
            </p>
            <p className="mt-3 text-3xl font-black tracking-[-0.03em] text-white">
              {bingoAnnouncement}
            </p>
          </div>
        </div>
      )}

      <main className="no-scrollbar flex-1 overflow-y-auto pb-6">
        <div className="space-y-4 px-4 py-4">
          <section className="rounded-[1.75rem] border border-white/10 bg-white/5 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">あなたのカード</p>
                <p className="mt-1 text-lg font-black tracking-[-0.02em] text-white">{state.name}</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                {round ? `第${round.roundNumber}ラウンド` : '待機中'}
              </div>
            </div>

            <BingoCard card={state.card} highlightNumber={round?.drawnNumber ?? undefined} size="md" />
          </section>

          {isVoting && round && (
            <VotePanel
              question={round.question}
              optionA={round.optionA}
              optionB={round.optionB}
              myVote={state.currentVote}
              disabled={!!state.currentVote}
              onVote={handleVote}
            />
          )}

          {!isVoting && round?.majorityVote && resultLabel && (
            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">ラウンド結果</p>
              <p className="mt-3 text-sm leading-6 text-slate-300">{round.question}</p>
              <p className="mt-4 text-2xl font-black tracking-[-0.03em] text-white">{resultLabel}</p>
              <p className="mt-2 text-sm text-slate-400">多数派: {round.majorityVote}</p>
              {state.currentVote && (
                <p
                  className={clsx(
                    'mt-4 rounded-2xl border px-4 py-3 text-sm font-medium',
                    state.currentVote === round.majorityVote
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'
                      : 'border-rose-500/20 bg-rose-500/10 text-rose-200',
                  )}
                >
                  あなたは{' '}
                  {state.currentVote === 'A' ? round.optionA : round.optionB}
                  {state.currentVote === round.majorityVote
                    ? ' を選び、多数派でした。'
                    : ' を選びましたが、今回は少数派でした。'}
                </p>
              )}
            </section>
          )}

          {!round && (
            <section className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-center shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">待機中</p>
              <p className="mt-3 text-xl font-black tracking-[-0.02em] text-white">
                次のラウンドを待っています
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                このページは開いたままで大丈夫です。次の質問が始まると、盤面と状態が自動で更新されます。
              </p>
            </section>
          )}

          <section className={clsx('rounded-[1.5rem] border p-4 text-center shadow-sm', banner.tone)}>
            <div className="flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-[0.2em]">
              <span className="text-base">{banner.icon}</span>
              <span>{banner.eyebrow}</span>
            </div>
            <p className="mt-2 text-2xl font-black tracking-[-0.03em] text-white">{banner.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{banner.subtitle}</p>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-[#690dab]/20 bg-[#690dab]/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d8b4fe]">今回の番号</p>
              <p className="mt-2 text-3xl font-black tracking-[-0.03em] text-white">
                {round?.drawnNumber ?? (isVoting ? '...' : '—')}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {round?.drawnNumber != null
                  ? myCardHasDrawn
                    ? 'あなたのカードにある番号です。'
                    : 'あなたのカードにはありません。'
                  : isVoting
                  ? '投票終了まで非公開です。'
                  : '公開を待っています。'}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">ビンゴまであと</p>
              <div className="mt-2 flex items-end gap-2">
                <p className="text-3xl font-black tracking-[-0.03em] text-white">{cellsToBingo}</p>
                <p className="pb-1 text-xs text-slate-300">マス</p>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                フリーマスを含めて、25マス中 {openedCount} マスが開いています。
              </p>
            </div>
          </section>
        </div>
      </main>
    </Shell>
  );
}
