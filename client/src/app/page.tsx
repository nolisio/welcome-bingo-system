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
const NAME_KEY = 'bingo_name';

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

function isCellOpen(openedCells: number, index: number) {
  return (openedCells & (1 << index)) !== 0;
}

function countOpenedCells(openedCells: number) {
  return Array.from({ length: 25 }, (_, index) => index).filter((index) =>
    isCellOpen(openedCells, index),
  ).length;
}

function getCellsToBingo(openedCells: number) {
  return Math.min(
    ...BINGO_LINES.map(
      (line) => line.filter((index) => !isCellOpen(openedCells, index)).length,
    ),
  );
}

function getSelectableBonusIndexes(openedCells: number) {
  return Array.from({ length: 25 }, (_, index) => index).filter(
    (index) => !isCellOpen(openedCells, index),
  );
}

function getBannerCopy(
  round: ParticipantRound | null,
  currentVote: VoteChoice | null,
  myCardHasDrawn: boolean,
  iOpenedACell: boolean,
) {
  if (!round) {
    return {
      eyebrow: '待機中',
      title: '次のラウンドを待っています',
      subtitle: '管理者がラウンドを開始すると、ここに質問とゲームの進行が表示されます。',
      tone: 'border-white/10 bg-white/5 text-slate-100',
    };
  }

  if (round.status === 'VOTING') {
    return {
      eyebrow: '投票受付中',
      title: currentVote ? '投票を受け付けました' : 'どちらかを選んでください',
      subtitle: currentVote
        ? '結果発表までこのままお待ちください。'
        : round.question,
      tone: 'border-[#690dab]/30 bg-[#690dab]/10 text-[#d8b4fe]',
    };
  }

  if (round.status === 'COMPLETED') {
    return {
      eyebrow: 'ラウンド結果',
      title:
        round.drawnNumber != null
          ? `${round.drawnNumber} 番が確定しました`
          : 'ラウンド結果が確定しました',
      subtitle: iOpenedACell
        ? 'あなたのカードのマスが1つ開きました。'
        : myCardHasDrawn
          ? 'カードに数字はありましたが、今回はマスは開きませんでした。'
          : '今回の数字はあなたのカードにはありませんでした。',
      tone: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200',
    };
  }

  return {
    eyebrow: '確認中',
    title: '結果を集計しています',
    subtitle: 'もう少しすると多数派と開いたマスが反映されます。',
    tone: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  };
}

function buildBannerCopy(
  round: ParticipantRound | null,
  currentVote: VoteChoice | null,
  myCardHasDrawn: boolean,
  iOpenedACell: boolean,
  canChooseBonusCell: boolean,
) {
  if (!round) {
    return {
      eyebrow: '待機中',
      title: '次のラウンドを待っています',
      subtitle: '管理者がラウンドを開始すると、ここに質問とゲームの進行が表示されます。',
      tone: 'border-white/10 bg-white/5 text-slate-100',
    };
  }

  if (round.status === 'VOTING') {
    return {
      eyebrow: '投票受付中',
      title: currentVote ? '投票を受け付けました' : 'どちらかを選んでください',
      subtitle: currentVote
        ? '結果発表までこのままお待ちください。'
        : round.question,
      tone: 'border-[#690dab]/30 bg-[#690dab]/10 text-[#d8b4fe]',
    };
  }

  if (round.status === 'COMPLETED' && round.isBonusRound) {
    return {
      eyebrow: 'ボーナスタイム',
      title: canChooseBonusCell ? '好きなマスを1つ選べます' : '★ の結果が確定しました',
      subtitle: canChooseBonusCell
        ? '多数派を選べたので、開けたいマスを1つタップしてください。'
        : round.myBonusSelectionCellIndex != null
          ? 'あなたは好きなマスを1つ開けました。'
          : round.pendingBonusSelectorCount > 0
            ? '対象者が追加でマスを選んでいます。少しお待ちください。'
            : iOpenedACell
              ? 'ボーナスタイムであなたのマスが1つ開きました。'
              : '今回はあなたの追加開放はありませんでした。',
      tone: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
    };
  }

  return getBannerCopy(round, currentVote, myCardHasDrawn, iOpenedACell);
}

function getRoundOutcome(round: ParticipantRound | null) {
  if (!round) {
    return {
      choice: null as VoteChoice | null,
      label: null as string | null,
      descriptor: '多数派',
      isQuizBonus: false,
    };
  }

  const choice =
    round.bonusRoundType === 'QUIZ' ? round.correctChoice : round.majorityVote;
  const label =
    choice === 'A' ? round.optionA : choice === 'B' ? round.optionB : null;

  return {
    choice,
    label,
    descriptor: round.bonusRoundType === 'QUIZ' ? '正解' : '多数派',
    isQuizBonus: round.bonusRoundType === 'QUIZ',
  };
}

function buildResolvedBannerCopy(
  round: ParticipantRound | null,
  currentVote: VoteChoice | null,
  myCardHasDrawn: boolean,
  iOpenedACell: boolean,
  canChooseBonusCell: boolean,
) {
  if (!(round?.status === 'COMPLETED' && round.isBonusRound)) {
    return buildBannerCopy(
      round,
      currentVote,
      myCardHasDrawn,
      iOpenedACell,
      canChooseBonusCell,
    );
  }

  const outcome = getRoundOutcome(round);

  return {
    eyebrow: outcome.isQuizBonus ? 'ボーナス問題' : 'ボーナスタイム',
    title: canChooseBonusCell
      ? '好きなマスを1つ選んでください'
      : outcome.isQuizBonus
        ? '★ の正解を発表しました'
        : '★ の結果を発表しました',
    subtitle: canChooseBonusCell
      ? outcome.isQuizBonus
        ? '正解したので、好きなマスを1つだけ開けられます。'
        : '多数派だったので、好きなマスを1つだけ開けられます。'
      : round.myBonusSelectionCellIndex != null
        ? 'あなたのボーナスマス選択は完了しました。'
        : round.pendingBonusSelectorCount > 0
          ? outcome.isQuizBonus
            ? '正解した参加者がマスを選択中です。しばらくお待ちください。'
            : '多数派だった参加者がマスを選択中です。しばらくお待ちください。'
          : iOpenedACell
            ? 'ボーナスであなたのカードが1マス開きました。'
            : `${outcome.descriptor}に入れなかったため、今回はボーナスマスの対象外です。`,
    tone: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
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
    <div
      className="min-h-[100dvh] bg-[#12091c] text-slate-100"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
      }}
    >
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden border-x border-[#690dab]/10 bg-[#1a1022] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
        <header className="flex items-center justify-between border-b border-white/10 bg-[#1a1022]/95 px-4 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-[0.08em] text-[#c084fc]">
              新歓ビンゴ
            </p>
            <h1 className="truncate text-lg font-bold text-white">
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

function StatusChip({
  connected,
}: {
  connected: boolean;
}) {
  return (
    <div
      className={clsx(
        'rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.08em]',
        connected
          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
          : 'border-white/10 bg-white/5 text-slate-400',
      )}
    >
      {connected ? '接続中' : '再接続中'}
    </div>
  );
}

function StatTile({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'violet' | 'emerald' | 'amber';
}) {
  const toneClass = {
    default: 'border-white/10 bg-white/5 text-slate-100',
    violet: 'border-[#690dab]/25 bg-[#690dab]/12 text-white',
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-white',
    amber: 'border-amber-400/25 bg-amber-400/10 text-white',
  }[tone];

  return (
    <div className={clsx('rounded-2xl border px-3 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)]', toneClass)}>
      <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-300">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-300">{detail}</p>
    </div>
  );
}

export default function ParticipantPage() {
  const [name, setName] = useState('');
  const [isNewEmployee, setIsNewEmployee] = useState(false);
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<ParticipantState | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [bingoAnnouncement, setBingoAnnouncement] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [customOptionA, setCustomOptionA] = useState('');
  const [customOptionB, setCustomOptionB] = useState('');
  const [customQuestionFeedback, setCustomQuestionFeedback] = useState('');
  const [customQuestionLoading, setCustomQuestionLoading] = useState(false);
  const [bonusSelection, setBonusSelection] = useState<number | null>(null);
  const [bonusFeedback, setBonusFeedback] = useState('');
  const [bonusLoading, setBonusLoading] = useState(false);
  const bingoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storedName = localStorage.getItem(NAME_KEY);
    if (storedName) {
      setName(storedName);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      const sessionId = getOrCreateSessionId();
      const storedName = localStorage.getItem(NAME_KEY);
      if (storedName) {
        socket.emit('participant:reconnect', { sessionId }, (res: any) => {
          if (res?.ok) {
            setJoined(true);
          }
        });
      }
    };

    const onDisconnect = () => setConnected(false);
    const onParticipantState = (data: ParticipantState) => setState(data);
    const onBingoWinner = (data: { message: string }) => {
      setBingoAnnouncement(data.message);
      if (bingoTimerRef.current) clearTimeout(bingoTimerRef.current);
      bingoTimerRef.current = setTimeout(() => setBingoAnnouncement(null), 8000);
    };
    const onGameReset = () => {
      setJoined(false);
      setState(null);
      setError('');
      setCustomQuestion('');
      setCustomOptionA('');
      setCustomOptionB('');
      setCustomQuestionFeedback('');
      setBonusSelection(null);
      setBonusFeedback('');
      setBonusLoading(false);
      setBingoAnnouncement(null);
      localStorage.removeItem(NAME_KEY);
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

  const activeCustomQuestionRequest = state?.customQuestionRequest ?? null;
  const isRequestedAuthor =
    !!state &&
    !!activeCustomQuestionRequest &&
    activeCustomQuestionRequest.participantId === state.id;
  const showVoteOverlay = state?.currentRound?.status === 'VOTING';
  const showCustomQuestionOverlay = !!isRequestedAuthor;
  const showBonusOverlay = !!state?.canChooseBonusCell;

  useEffect(() => {
    if (!showCustomQuestionOverlay) return;
    setCustomQuestion('');
    setCustomOptionA('');
    setCustomOptionB('');
    setCustomQuestionFeedback('');
  }, [showCustomQuestionOverlay, activeCustomQuestionRequest?.requestedAt]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previousOverflow = document.body.style.overflow;
    if (showVoteOverlay || showCustomQuestionOverlay || showBonusOverlay) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showVoteOverlay, showCustomQuestionOverlay, showBonusOverlay]);

  useEffect(() => {
    if (!showBonusOverlay) {
      setBonusSelection(null);
      setBonusLoading(false);
      return;
    }

    setBonusSelection(null);
    setBonusFeedback('');
    setBonusLoading(false);
  }, [showBonusOverlay, state?.currentRound?.id]);

  const handleJoin = () => {
    if (!name.trim()) {
      setError('表示名を入力してください。');
      return;
    }

    const socket = getSocket();
    const sessionId = getOrCreateSessionId();
    const trimmedName = name.trim();

    localStorage.setItem(NAME_KEY, trimmedName);
    socket.emit(
      'participant:join',
      { name: trimmedName, sessionId, isNewEmployee },
      (res: any) => {
        if (res?.ok) {
          setJoined(true);
          setError('');
        } else {
          setError(res?.error || '参加に失敗しました。');
        }
      },
    );
  };

  const handleVote = (choice: VoteChoice) => {
    const socket = getSocket();
    socket.emit('vote:submit', { choice }, (res: any) => {
      if (!res?.ok) {
        setError(res?.error || '投票に失敗しました。');
      }
    });
  };

  const handleSubmitCustomQuestion = () => {
    if (!customQuestion.trim() || !customOptionA.trim() || !customOptionB.trim()) {
      setCustomQuestionFeedback('質問文と2つの選択肢を入力してください。');
      return;
    }

    const socket = getSocket();
    setCustomQuestionLoading(true);
    socket.emit(
      'custom-question:submit',
      {
        question: customQuestion.trim(),
        optionA: customOptionA.trim(),
        optionB: customOptionB.trim(),
      },
      (res: any) => {
        setCustomQuestionLoading(false);
        if (res?.ok) {
          setCustomQuestion('');
          setCustomOptionA('');
          setCustomOptionB('');
          setCustomQuestionFeedback('質問案を送信しました。管理者の確認をお待ちください。');
        } else {
          setCustomQuestionFeedback(res?.error || '質問案の送信に失敗しました。');
        }
      },
    );
  };

  const handleSubmitBonusCell = () => {
    if (bonusSelection == null) {
      setBonusFeedback('開けたいマスを1つ選んでください。');
      return;
    }

    const socket = getSocket();
    setBonusLoading(true);
    socket.emit('bonus-cell:select', { cellIndex: bonusSelection }, (res: any) => {
      setBonusLoading(false);
      if (res?.ok) {
        setBonusFeedback('');
        setBonusSelection(null);
      } else {
        setBonusFeedback(res?.error || 'ボーナスマスの選択に失敗しました。');
      }
    });
  };

  if (!joined) {
    return (
      <Shell
        title="ビンゴに参加する"
        subtitle={connected ? '表示名を入力して参加してください。' : 'サーバーへ接続しています...'}
        right={<StatusChip connected={connected} />}
      >
        <main className="flex flex-1 flex-col justify-center px-6 py-8">
          <div className="rounded-[1.75rem] border border-[#690dab]/20 bg-white/5 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-6 inline-flex rounded-full border border-[#690dab]/30 bg-[#690dab]/10 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-[#d8b4fe]">
              参加
            </div>
            <h2 className="text-3xl font-bold text-white">
              参加情報を入力
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              参加後はこの画面でビンゴカードの確認、質問への投票、結果の確認を行います。
            </p>

            <label className="mt-8 block text-xs font-semibold tracking-[0.08em] text-slate-400">
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

            <div className="mt-6">
              <p className="text-xs font-semibold tracking-[0.08em] text-slate-400">
                新入社員ですか？
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setIsNewEmployee(true)}
                  className={clsx(
                    'rounded-2xl border px-4 py-4 text-sm font-bold transition',
                    isNewEmployee
                      ? 'border-[#690dab] bg-[#690dab] text-white shadow-[0_10px_24px_rgba(105,13,171,0.32)]'
                      : 'border-white/10 bg-[#241630] text-slate-200',
                  )}
                >
                  はい
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewEmployee(false)}
                  className={clsx(
                    'rounded-2xl border px-4 py-4 text-sm font-bold transition',
                    !isNewEmployee
                      ? 'border-[#690dab] bg-[#690dab] text-white shadow-[0_10px_24px_rgba(105,13,171,0.32)]'
                      : 'border-white/10 bg-[#241630] text-slate-200',
                  )}
                >
                  いいえ
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">
                新入社員として参加すると、中央マスが最初から開いた状態で始まります。
              </p>
            </div>

            {error && (
              <p className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            )}

            <button
              onClick={handleJoin}
              disabled={!connected}
              className="mt-6 flex w-full items-center justify-center rounded-2xl border-b-4 border-black/20 bg-[#690dab] px-4 py-4 text-base font-semibold tracking-[0.08em] text-white shadow-[0_14px_30px_rgba(105,13,171,0.4)] transition hover:bg-[#7a18c1] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
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
        title="ビンゴ"
        subtitle="参加情報を読み込んでいます。"
        right={<StatusChip connected={connected} />}
      >
        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="w-full rounded-[1.75rem] border border-white/10 bg-white/5 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#690dab]/25 border-t-[#690dab]" />
            <p className="mt-5 text-lg font-bold text-white">カードを読み込んでいます...</p>
            <p className="mt-2 text-sm text-slate-400">
              参加情報の復元が終わるまで、このままお待ちください。
            </p>
          </div>
        </main>
      </Shell>
    );
  }

  const round = state.currentRound;
  const myCardHasDrawn =
    round?.drawnNumber != null &&
    round.drawnNumber > 0 &&
    state.card.numbers.includes(round.drawnNumber);
  const iOpenedACell = round?.cellOpeners.includes(state.id) ?? false;
  const openedCount = countOpenedCells(state.card.openedCells);
  const cellsToBingo = getCellsToBingo(state.card.openedCells);
  const bonusSelectableIndexes = showBonusOverlay
    ? getSelectableBonusIndexes(state.card.openedCells)
    : [];
  const baseBanner = buildResolvedBannerCopy(
    round,
    state.currentVote,
    myCardHasDrawn,
    iOpenedACell,
    !!state.canChooseBonusCell,
  );
  const banner =
    activeCustomQuestionRequest && !isRequestedAuthor
      ? {
          eyebrow: '質問作成中',
          title: `${activeCustomQuestionRequest.participantName}さんが質問を作成しています`,
          subtitle: '誤操作防止のため、他の参加者には入力欄を表示していません。少しお待ちください。',
          tone: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
        }
      : baseBanner;
  const roundOutcome = getRoundOutcome(round);
  const resultLabel = roundOutcome.label;
  const drawnDisplayLabel =
    round?.drawnNumber != null
      ? round.isBonusRound
        ? '★'
        : String(round.drawnNumber)
      : showVoteOverlay
        ? '...'
        : '-';
  const progressValue =
    activeCustomQuestionRequest && !isRequestedAuthor
      ? '質問待ち'
      : !round
        ? '待機中'
        : `第${round.roundNumber}ラウンド`;
  const progressDetail =
    activeCustomQuestionRequest && !isRequestedAuthor
      ? `${activeCustomQuestionRequest.participantName}さんが入力中です`
      : !round
        ? '次のラウンド開始を待っています'
        : round.status === 'VOTING'
          ? '回答受付中です'
          : round.status === 'COMPLETED'
            ? '結果を反映しました'
            : '結果を集計しています';
  const numberDetail =
    round?.drawnNumber != null
      ? myCardHasDrawn
        ? 'あなたのカードにある数字です'
        : 'あなたのカードにはない数字です'
      : showVoteOverlay
        ? '結果発表まで非表示です'
        : round?.isBonusRound
          ? 'ボーナス結果を待っています'
          : '数字が確定すると表示されます';
  const bingoValue = state.hasBingo ? '達成' : `${cellsToBingo}`;
  const bingoDetail = state.hasBingo
    ? 'そのまま結果発表をお待ちください'
    : `開放 ${openedCount}/25 マス`;
  const noticeMessage = error;
  const shellSubtitle =
    showBonusOverlay
      ? '好きなマスを1つ選んで確定してください。'
      : showVoteOverlay
        ? state.currentVote
          ? '投票済みです。結果発表までそのままお待ちください。'
          : '表示されている2択に回答してください。'
        : activeCustomQuestionRequest && !isRequestedAuthor
          ? `${activeCustomQuestionRequest.participantName}さんが質問を作成中です。`
          : !round
            ? '次のラウンド開始を待っています。'
            : state.hasBingo
              ? 'ビンゴ達成です。結果発表をお待ちください。'
              : round.isBonusRound && round.pendingBonusSelectorCount > 0
                ? '対象者のボーナスマス選択が終わるまでお待ちください。'
                : 'カードと結果を確認しながら次の進行を待てます。';

  return (
    <Shell
      title="ビンゴ"
      subtitle={shellSubtitle}
      right={
        <div className="space-y-2 text-right">
          <StatusChip connected={connected} />
          {state.hasBingo && (
            <div className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-amber-200">
              ビンゴ
            </div>
          )}
        </div>
      }
    >
      {bingoAnnouncement && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-4 sm:px-6"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 4rem)' }}
        >
          <div className="w-full max-w-md rounded-[1.75rem] border border-amber-300/30 bg-[linear-gradient(135deg,rgba(82,26,102,0.96),rgba(32,18,48,0.98))] px-5 py-5 text-center shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-amber-100">
              <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.85)]" />
              ビンゴ達成
            </div>
            <p className="mt-4 text-3xl font-bold text-white">
              {bingoAnnouncement}
            </p>
            <p className="mt-2 text-sm leading-6 text-amber-100/85">
              そのまま結果発表をお待ちください。
            </p>
          </div>
        </div>
      )}

      {showCustomQuestionOverlay && activeCustomQuestionRequest && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm sm:px-6"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
          }}
        >
          <div className="w-full max-w-xl translate-y-[-4vh] rounded-[1.75rem] border border-[#690dab]/25 bg-[#1a1022] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:translate-y-[-6vh]">
            <p className="text-xs font-semibold tracking-[0.08em] text-[#d8b4fe]">
              質問作成の依頼が届きました
            </p>
            <h2 className="mt-3 text-2xl font-bold text-white">
              2択の質問を入力してください
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              管理者から質問作成が依頼されています。入力した内容は管理者が確認してから使用します。
            </p>

            <div className="mt-5 space-y-3">
              <input
                type="text"
                value={customQuestion}
                onChange={(e) => setCustomQuestion(e.target.value)}
                placeholder="質問文"
                className="w-full rounded-2xl border border-white/10 bg-[#241630] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#690dab] focus:ring-2 focus:ring-[#690dab]/30"
                maxLength={120}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="text"
                  value={customOptionA}
                  onChange={(e) => setCustomOptionA(e.target.value)}
                  placeholder="選択肢 A"
                  className="w-full rounded-2xl border border-white/10 bg-[#241630] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#690dab] focus:ring-2 focus:ring-[#690dab]/30"
                  maxLength={40}
                />
                <input
                  type="text"
                  value={customOptionB}
                  onChange={(e) => setCustomOptionB(e.target.value)}
                  placeholder="選択肢 B"
                  className="w-full rounded-2xl border border-white/10 bg-[#241630] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-[#690dab] focus:ring-2 focus:ring-[#690dab]/30"
                  maxLength={40}
                />
              </div>
              <button
                onClick={handleSubmitCustomQuestion}
                disabled={customQuestionLoading}
                className="w-full rounded-2xl border-b-4 border-black/20 bg-[#690dab] px-4 py-4 text-sm font-black uppercase tracking-[0.16em] text-white shadow-[0_14px_30px_rgba(105,13,171,0.35)] transition hover:bg-[#7a18c1] disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
              >
                {customQuestionLoading ? '送信中...' : '質問案を送信'}
              </button>
            </div>

            {customQuestionFeedback && (
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200">
                {customQuestionFeedback}
              </p>
            )}
          </div>
        </div>
      )}

      {showVoteOverlay && round && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm sm:px-6"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
          }}
        >
          <div className="w-full max-w-xl translate-y-[-4vh] sm:translate-y-[-6vh]">
            <div className="mb-3 rounded-2xl border border-[#690dab]/25 bg-[#140a1c]/90 px-4 py-3 text-center shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
              <p className="text-xs font-semibold tracking-[0.08em] text-[#d8b4fe]">
                投票受付中
              </p>
              <p className="mt-2 text-sm text-slate-300">
                スクロール不要で、この場で回答できます。
              </p>
            </div>

            {round.questionImageUrl && (
              <div className="mb-3 overflow-hidden rounded-2xl border border-white/10 bg-[#140a1c]/90 shadow-[0_14px_40px_rgba(0,0,0,0.28)]">
                <img
                  src={round.questionImageUrl}
                  alt="質問画像"
                  className="max-h-64 w-full object-cover"
                />
              </div>
            )}

            <VotePanel
              question={round.question}
              optionA={round.optionA}
              optionB={round.optionB}
              optionAImageUrl={round.optionAImageUrl}
              optionBImageUrl={round.optionBImageUrl}
              myVote={state.currentVote}
              disabled={!!state.currentVote}
              onVote={handleVote}
            />
          </div>
        </div>
      )}

      {showBonusOverlay && round && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm sm:px-6"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 1.5rem)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)',
          }}
        >
          <div className="w-full max-w-xl translate-y-[-4vh] rounded-[1.75rem] border border-amber-300/25 bg-[#1a1022] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:translate-y-[-6vh]">
            <p className="text-xs font-semibold tracking-[0.08em] text-amber-200">
              {round.bonusRoundType === 'QUIZ' ? 'ボーナス問題' : 'ボーナスタイム'}
            </p>
            <h2 className="hidden">
              好きなマスを1つ選んでください
            </h2>
            <p className="hidden">
              多数派を選べたので、追加で1マス開けられます。開けたいマスをタップして確定してください。
            </p>

            <h2 className="mt-3 text-2xl font-bold text-white">
              好きなマスを1つ選んでください
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              {round.bonusRoundType === 'QUIZ'
                ? '正解した人だけがボーナスで1マス開けられます。タップして確定してください。'
                : '多数派だった人だけがボーナスで1マス開けられます。タップして確定してください。'}
            </p>

            <div className="mt-5">
              <BingoCard
                card={state.card}
                size="md"
                selectableCellIndexes={bonusSelectableIndexes}
                selectedCellIndex={bonusSelection}
                onCellClick={setBonusSelection}
              />
            </div>

            <p className="mt-4 text-center text-sm text-amber-100/85">
              {bonusSelection != null
                ? `${state.card.numbers[bonusSelection]}番を開けます。内容を確認して確定してください。`
                : '開けたいマスを1つタップすると、確定ボタンの内容が変わります。'}
            </p>

            <button
              onClick={handleSubmitBonusCell}
              disabled={bonusLoading || bonusSelection == null}
              className="mt-5 w-full rounded-2xl border-b-4 border-black/20 bg-amber-500 px-4 py-4 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_14px_30px_rgba(245,158,11,0.35)] transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            >
              {bonusLoading
                ? '確定中...'
                : bonusSelection != null
                  ? `${state.card.numbers[bonusSelection]}番を開ける`
                  : 'このマスを開ける'}
            </button>

            {bonusFeedback && (
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-slate-200">
                {bonusFeedback}
              </p>
            )}
          </div>
        </div>
      )}

      <main
        className="flex flex-1 min-h-0 flex-col overflow-hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-4">
          <section className="grid grid-cols-3 gap-2">
            <StatTile
              label="進行"
              value={progressValue}
              detail={progressDetail}
              tone="default"
            />
            <StatTile
              label="今回の数字"
              value={drawnDisplayLabel}
              detail={numberDetail}
              tone={round?.isBonusRound ? 'amber' : 'violet'}
            />
            <StatTile
              label="ビンゴまで"
              value={bingoValue}
              detail={bingoDetail}
              tone="emerald"
            />
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-[1.75rem] border border-white/10 bg-white/5 p-3 shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
            <div className="flex items-center justify-between px-1">
              <div className="min-w-0">
                <p className="text-xs font-semibold tracking-[0.08em] text-slate-400">
                  あなたのカード
                </p>
                <p className="mt-1 truncate text-base font-semibold text-white">
                  {state.name}
                </p>
              </div>
              <div className="ml-3 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                {round ? `ラウンド ${round.roundNumber}` : '待機中'}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center py-3">
              <div className="w-full max-w-[21rem]">
                <BingoCard
                  card={state.card}
                  highlightNumber={
                    round && !round.isBonusRound ? round.drawnNumber ?? undefined : undefined
                  }
                  size="sm"
                />
              </div>
            </div>
          </section>

          <div className="space-y-2 pb-1">
            {resultLabel && !showVoteOverlay && round && (
              <section className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 shadow-[0_10px_30px_rgba(0,0,0,0.16)]">
                <p className="text-[10px] font-semibold tracking-[0.08em] text-slate-400">
                  直前の結果
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{resultLabel}</p>
                    <p className="mt-1 text-[11px] text-slate-300">
                      {roundOutcome.descriptor}: {roundOutcome.choice}
                      {state.currentVote ? ` / あなた: ${state.currentVote}` : ''}
                    </p>
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200">
                    {round.isBonusRound ? '★' : drawnDisplayLabel}
                  </div>
                </div>
              </section>
            )}

            <section className={clsx('rounded-2xl border px-4 py-3 text-center shadow-sm', banner.tone)}>
              <p className="text-[10px] font-semibold tracking-[0.08em]">{banner.eyebrow}</p>
              <p className="mt-1 text-lg font-semibold text-white">{banner.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{banner.subtitle}</p>
            </section>

            {noticeMessage && (
              <p className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {noticeMessage}
              </p>
            )}
          </div>
        </div>
      </main>
    </Shell>
  );
}
