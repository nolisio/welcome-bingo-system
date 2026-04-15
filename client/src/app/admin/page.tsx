'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { getSocket } from '@/lib/socket';
import {
  AdminParticipantSummary,
  BonusRoundType,
  BingoWinner,
  CustomQuestionRequestInfo,
  CustomQuestionReview,
  PreparedQuestionKind,
  PreparedQuestionRecord,
  PublicGameState,
} from '@/types/game';

const GAME_STATUS_LABELS: Record<string, string> = {
  WAITING: '待機中',
  ACTIVE: '進行中',
  FINISHED: '終了',
};

const ROUND_STATUS_LABELS: Record<string, string> = {
  VOTING: '投票中',
  CLOSED: '締切',
  COMPLETED: '結果発表後',
};

function AdminMetricCard({
  label,
  value,
  detail,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'emerald' | 'amber' | 'sky';
}) {
  const toneClass = {
    default: 'border-white/10 bg-gray-900',
    emerald: 'border-emerald-400/20 bg-emerald-400/10',
    amber: 'border-amber-400/20 bg-amber-400/10',
    sky: 'border-sky-400/20 bg-sky-400/10',
  }[tone];

  return (
    <div className={clsx('rounded-2xl border p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)]', toneClass)}>
      <p className="text-[11px] font-semibold tracking-[0.08em] text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-gray-300">{detail}</p>
    </div>
  );
}

const QUESTION_SAMPLE_PRESETS = [
  {
    id: 'homework',
    label: '夏休みの宿題',
    question: '夏休みの宿題、どっち派？',
    optionA: '最初に終わらせる',
    optionB: '最後に追い込む',
    questionImageUrl: '',
    optionAImageUrl: '',
    optionBImageUrl: '',
  },
  {
    id: 'food',
    label: '今食べたい',
    question: '今食べたいのは？',
    optionA: '肉',
    optionB: '魚',
    questionImageUrl: '/question-assets/majority/food/nanitabeyou.jpeg',
    optionAImageUrl: '/question-assets/majority/food/meet.png',
    optionBImageUrl: '/question-assets/majority/food/fish.png',
  },
  {
    id: 'life',
    label: '大事なのは',
    question: '大事なのはどっち？',
    optionA: '食事',
    optionB: '睡眠',
    questionImageUrl: '',
    optionAImageUrl: '',
    optionBImageUrl: '',
  },
] as const;

type PreparedQuestionInputState = {
  kind: PreparedQuestionKind;
  question: string;
  optionA: string;
  optionB: string;
  imageUrl: string;
  optionAImageUrl: string;
  optionBImageUrl: string;
  correctChoice: 'A' | 'B';
};

const DEFAULT_PREPARED_QUESTION_INPUT: PreparedQuestionInputState = {
  kind: 'MAJORITY',
  question: '',
  optionA: '',
  optionB: '',
  imageUrl: '',
  optionAImageUrl: '',
  optionBImageUrl: '',
  correctChoice: 'A',
};

const MAJORITY_SAMPLE_PRESETS = [
  {
    id: 'homework',
    label: '夏休みの宿題',
    question: '夏休みの宿題、どっち派？',
    optionA: '最初に終わらせる',
    optionB: '最後に追い込む',
    questionImageUrl: '',
    optionAImageUrl: '',
    optionBImageUrl: '',
  },
  {
    id: 'food',
    label: '今食べたい',
    question: '今食べたいのは？',
    optionA: '肉',
    optionB: '魚',
    questionImageUrl: '/question-assets/majority/food/nanitabeyou.jpeg',
    optionAImageUrl: '/question-assets/majority/food/meet.png',
    optionBImageUrl: '/question-assets/majority/food/fish.png',
  },
  {
    id: 'life',
    label: '大事なのは',
    question: '大事なのはどっち？',
    optionA: '食事',
    optionB: '睡眠',
    questionImageUrl: '',
    optionAImageUrl: '',
    optionBImageUrl: '',
  },
] as const;

const QUIZ_SAMPLE_PRESETS = [
  {
    id: 'it',
    label: 'ITクイズ',
    question: 'ITは何の略？',
    optionA: 'Information Technology',
    optionB: 'Internet Technology',
    correctChoice: 'A' as const,
  },
  {
    id: 'ai',
    label: 'AIクイズ',
    question: 'AIって何の略？',
    optionA: 'Artificial Intelligence',
    optionB: 'Automatic Intelligence',
    correctChoice: 'A' as const,
  },
] as const;

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [connected, setConnected] = useState(false);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [participants, setParticipants] = useState<AdminParticipantSummary[]>([]);
  const [activeQuestionRequest, setActiveQuestionRequest] =
    useState<CustomQuestionRequestInfo | null>(null);
  const [question, setQuestion] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [optionAImageUrl, setOptionAImageUrl] = useState('');
  const [optionBImageUrl, setOptionBImageUrl] = useState('');
  const [bonusRoundType, setBonusRoundType] = useState<BonusRoundType>('NONE');
  const [correctChoice, setCorrectChoice] = useState<'A' | 'B'>('A');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [winners, setWinners] = useState<BingoWinner[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestionReview[]>([]);
  const [preparedQuestions, setPreparedQuestions] = useState<PreparedQuestionRecord[]>([]);
  const [preparedQuestionInput, setPreparedQuestionInput] =
    useState<PreparedQuestionInputState>(DEFAULT_PREPARED_QUESTION_INPUT);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit('public:subscribe');
    };
    const onDisconnect = () => setConnected(false);
    const onGameState = (data: PublicGameState) => setGameState(data);
    const onBingoWinner = (data: { winners: BingoWinner[] }) => {
      setWinners((previous) => {
        const newOnes = data.winners.filter(
          (winner) => !previous.some((current) => current.id === winner.id),
        );
        return [...previous, ...newOnes];
      });
    };
    const onCustomQuestionListUpdated = (data: { questions: CustomQuestionReview[] }) => {
      setCustomQuestions(data.questions);
    };
    const onPreparedQuestionListUpdated = (data: { questions: PreparedQuestionRecord[] }) => {
      setPreparedQuestions(data.questions);
    };
    const onParticipantState = (data: {
      participants: AdminParticipantSummary[];
      activeRequest: CustomQuestionRequestInfo | null;
    }) => {
      setParticipants(data.participants);
      setActiveQuestionRequest(data.activeRequest);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:state', onGameState);
    socket.on('bingo:winner', onBingoWinner);
    socket.on('admin:custom-question:list-updated', onCustomQuestionListUpdated);
    socket.on('admin:prepared-question:list-updated', onPreparedQuestionListUpdated);
    socket.on('admin:participant-state', onParticipantState);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game:state', onGameState);
      socket.off('bingo:winner', onBingoWinner);
      socket.off('admin:custom-question:list-updated', onCustomQuestionListUpdated);
      socket.off('admin:prepared-question:list-updated', onPreparedQuestionListUpdated);
      socket.off('admin:participant-state', onParticipantState);
    };
  }, []);

  useEffect(() => {
    if (!authed || !secret.trim() || !connected) return;

    const socket = getSocket();
    socket.emit('admin:subscribe', { secret }, (res: any) => {
      if (!res?.ok) {
        setFeedback(res?.error ?? '管理画面の初期化に失敗しました。');
        setTimeout(() => setFeedback(''), 3000);
      }
    });
    socket.emit('admin:custom-question:list', { secret }, (res: any) => {
      if (res?.ok) {
        setCustomQuestions(res.questions ?? []);
      }
    });
    socket.emit('admin:prepared-question:list', { secret }, (res: any) => {
      if (res?.ok) {
        setPreparedQuestions(res.questions ?? []);
      }
    });
  }, [authed, secret, connected]);

  const showFeedback = (message: string) => {
    setFeedback(message);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleLogin = () => {
    if (!secret.trim()) {
      setAuthError('管理者キーを入力してください。');
      return;
    }
    if (!connected) {
      setAuthError('サーバーへ接続してから再度お試しください。');
      return;
    }

    const socket = getSocket();
    setLoading(true);
    socket.emit('admin:subscribe', { secret }, (res: any) => {
      setLoading(false);
      if (res?.ok) {
        setAuthError('');
        setAuthed(true);
        return;
      }

      setAuthed(false);
      setAuthError(res?.error ?? '管理者認証に失敗しました。');
    });
  };

  const emitAdmin = (event: string, data: object, cb?: (res: any) => void) => {
    const socket = getSocket();
    setLoading(true);
    socket.emit(event, { ...data, secret }, (res: any) => {
      setLoading(false);
      if (res?.ok) {
        showFeedback('処理が完了しました。');
      } else {
        showFeedback(res?.error ?? '不明なエラーが発生しました');
      }
      if (cb) cb(res);
    });
  };

  const handleStartGame = () => emitAdmin('admin:start-game', {});

  const handleResetGame = () => {
    if (!confirm('ゲームの状態をすべてリセットします。よろしいですか？')) {
      return;
    }

    emitAdmin('admin:reset-game', {}, (res) => {
      if (res?.ok) {
        setWinners([]);
        setCustomQuestions([]);
        setPreparedQuestions([]);
        setParticipants([]);
        setActiveQuestionRequest(null);
      }
    });
  };

  // Manual round starts go through a single handler so quiz/bonus validation
  // stays aligned with the current admin flow.

  const handleManualRoundStart = () => {
    if (!question.trim() || !optionA.trim() || !optionB.trim()) {
      showFeedback('質問文と2つの選択肢を入力してください。');
      return;
    }

    if (bonusRoundType === 'QUIZ' && !correctChoice) {
      showFeedback('ボーナス問題では正解を選んでください。');
      return;
    }

    emitAdmin(
      'admin:start-round',
      {
        question,
        optionA,
        optionB,
        questionImageUrl: questionImageUrl || null,
        optionAImageUrl: optionAImageUrl || null,
        optionBImageUrl: optionBImageUrl || null,
        bonusRoundType,
        correctChoice: bonusRoundType === 'QUIZ' ? correctChoice : null,
      },
      (res) => {
        if (res?.ok) {
          setQuestion('');
          setOptionA('');
          setOptionB('');
          setQuestionImageUrl('');
          setOptionAImageUrl('');
          setOptionBImageUrl('');
          setBonusRoundType('NONE');
          setCorrectChoice('A');
        }
      },
    );
  };

  const handleCloseVoting = () => emitAdmin('admin:close-voting', {});

  const handleStartRandomRound = () =>
    emitAdmin(
      'admin:start-random-round',
      { bonusRoundType },
      (res) => {
        if (res?.ok) {
          setBonusRoundType('NONE');
          setCorrectChoice('A');
        }
      },
    );

  const handleLoadQuizSample = () => {
    setQuestion('ITは何の略？');
    setOptionA('Information Technology');
    setOptionB('Internet Technology');
    setQuestionImageUrl('');
    setOptionAImageUrl('');
    setOptionBImageUrl('');
    setBonusRoundType('QUIZ');
    setCorrectChoice('A');
    showFeedback('ボーナス問題のサンプルを入力しました。');
  };

  const handleLoadAiQuizSample = () => {
    setQuestion('AIって何の略？');
    setOptionA('Artificial Intelligence');
    setOptionB('Automatic Intelligence');
    setQuestionImageUrl('');
    setOptionAImageUrl('');
    setOptionBImageUrl('');
    setBonusRoundType('QUIZ');
    setCorrectChoice('A');
    showFeedback('ボーナス問題のサンプルを入力しました。');
  };

  const handleLoadQuestionSample = (
    preset: (typeof QUESTION_SAMPLE_PRESETS)[number],
  ) => {
    setQuestion(preset.question);
    setOptionA(preset.optionA);
    setOptionB(preset.optionB);
    setQuestionImageUrl(preset.questionImageUrl);
    setOptionAImageUrl(preset.optionAImageUrl);
    setOptionBImageUrl(preset.optionBImageUrl);
    setBonusRoundType('NONE');
    setCorrectChoice('A');
    showFeedback(`「${preset.label}」を出題フォームへ反映しました。`);
  };

  const handleLoadPreparedQuizSample = (
    preset: (typeof QUIZ_SAMPLE_PRESETS)[number],
  ) => {
    setPreparedQuestionInput({
      kind: 'QUIZ',
      question: preset.question,
      optionA: preset.optionA,
      optionB: preset.optionB,
      imageUrl: '',
      optionAImageUrl: '',
      optionBImageUrl: '',
      correctChoice: preset.correctChoice,
    });
    showFeedback(`「${preset.label}」をプール入力欄へ反映しました。`);
  };

  const handleLoadPreparedQuestionSample = (
    preset: (typeof MAJORITY_SAMPLE_PRESETS)[number],
  ) => {
    setPreparedQuestionInput({
      kind: 'MAJORITY',
      question: preset.question,
      optionA: preset.optionA,
      optionB: preset.optionB,
      imageUrl: preset.questionImageUrl,
      optionAImageUrl: preset.optionAImageUrl,
      optionBImageUrl: preset.optionBImageUrl,
      correctChoice: 'A',
    });
    showFeedback(`「${preset.label}」をプール入力欄へ反映しました。`);
  };

  const handleApproveCustomQuestion = (customQuestionId: string) => {
    emitAdmin('admin:custom-question:approve', { customQuestionId });
  };

  const handleRejectCustomQuestion = (customQuestionId: string) => {
    emitAdmin('admin:custom-question:reject', { customQuestionId });
  };

  const handleApplyApprovedQuestion = (customQuestion: CustomQuestionReview) => {
    setQuestion(customQuestion.question);
    setOptionA(customQuestion.optionA);
    setOptionB(customQuestion.optionB);
    setQuestionImageUrl('');
    setOptionAImageUrl('');
    setOptionBImageUrl('');
    showFeedback('承認済みの質問を出題フォームへ反映しました。');
  };

  const handleRequestCustomQuestion = (participantId: string) => {
    emitAdmin('admin:custom-question:request', { participantId });
  };

  const handleCancelCustomQuestionRequest = () => {
    emitAdmin('admin:custom-question:cancel-request', {});
  };

  const handleCreatePreparedQuestion = () => {
    if (
      !preparedQuestionInput.question.trim() ||
      !preparedQuestionInput.optionA.trim() ||
      !preparedQuestionInput.optionB.trim()
    ) {
      showFeedback('質問プール登録には質問文と2つの選択肢が必要です。');
      return;
    }

    emitAdmin(
      'admin:prepared-question:create',
      {
        kind: preparedQuestionInput.kind,
        question: preparedQuestionInput.question,
        optionA: preparedQuestionInput.optionA,
        optionB: preparedQuestionInput.optionB,
        imageUrl: preparedQuestionInput.imageUrl || null,
        optionAImageUrl: preparedQuestionInput.optionAImageUrl || null,
        optionBImageUrl: preparedQuestionInput.optionBImageUrl || null,
        correctChoice:
          preparedQuestionInput.kind === 'QUIZ'
            ? preparedQuestionInput.correctChoice
            : null,
      },
      (res) => {
        if (res?.ok) {
          setPreparedQuestionInput(DEFAULT_PREPARED_QUESTION_INPUT);
        }
      },
    );
  };

  const handleTogglePreparedQuestion = (
    preparedQuestion: PreparedQuestionRecord,
  ) => {
    emitAdmin('admin:prepared-question:set-active', {
      preparedQuestionId: preparedQuestion.id,
      isActive: !preparedQuestion.isActive,
    });
  };

  const handleApplyPreparedQuestion = (preparedQuestion: PreparedQuestionRecord) => {
    setQuestion(preparedQuestion.question);
    setOptionA(preparedQuestion.optionA);
    setOptionB(preparedQuestion.optionB);
    setQuestionImageUrl(preparedQuestion.imageUrl ?? '');
    setOptionAImageUrl(preparedQuestion.optionAImageUrl ?? '');
    setOptionBImageUrl(preparedQuestion.optionBImageUrl ?? '');
    setBonusRoundType(preparedQuestion.kind === 'QUIZ' ? 'QUIZ' : 'NONE');
    setCorrectChoice(preparedQuestion.correctChoice ?? 'A');
    showFeedback('質問プールの内容を手入力フォームへ反映しました。');
  };

  if (!authed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
          <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">
            管理画面ログイン
          </h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => {
              setSecret(e.target.value);
              setAuthError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="管理者キー"
            className="mb-4 w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-lg focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleLogin}
            disabled={loading || !connected}
            className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:bg-gray-400"
          >
            {loading ? '確認中...' : connected ? '入室' : '接続中...'}
          </button>
          {authError && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {authError}
            </p>
          )}
        </div>
      </main>
    );
  }

  const currentRound = gameState?.currentRound;
  const isVoting = currentRound?.status === 'VOTING';
  const hasActiveGame = gameState?.status === 'ACTIVE';
  const noActiveRound = !currentRound || currentRound.status === 'COMPLETED';
  const hasPendingBonusSelections =
    (currentRound?.pendingBonusSelectorCount ?? 0) > 0;
  const pendingQuestions = customQuestions.filter((item) => item.status === 'PENDING');
  const approvedQuestions = customQuestions.filter((item) => item.status === 'APPROVED');
  const newEmployees = participants.filter((participant) => participant.isNewEmployee);
  const activePreparedQuestions = preparedQuestions.filter((item) => item.isActive);
  const activeMajorityPreparedQuestions = activePreparedQuestions.filter(
    (item) => item.kind === 'MAJORITY',
  );
  const activeQuizPreparedQuestions = activePreparedQuestions.filter(
    (item) => item.kind === 'QUIZ',
  );
  const availablePreparedQuestions = activePreparedQuestions.filter(
    (item) => !item.usedInCurrentGame,
  );
  const availableRandomPreparedQuestions = activeMajorityPreparedQuestions.filter(
    (item) => !item.usedInCurrentGame,
  );
  const bonusRoundEnabled = bonusRoundType === 'MAJORITY';
  const setBonusRoundEnabled = (enabled: boolean) =>
    setBonusRoundType(enabled ? 'MAJORITY' : 'NONE');
  const startRoundButtonLabel =
    bonusRoundType === 'QUIZ'
      ? 'ボーナス問題を開始'
      : bonusRoundType === 'MAJORITY'
        ? 'ボーナスタイムを開始'
        : '抽選してラウンド開始';
  const canStartGame = !loading && !hasActiveGame;
  const canStartManualRound =
    !loading && hasActiveGame && noActiveRound && !activeQuestionRequest && !hasPendingBonusSelections;
  const canStartRandomRound =
    canStartManualRound &&
    bonusRoundType !== 'QUIZ' &&
    availableRandomPreparedQuestions.length > 0;
  const nextAction = !hasActiveGame
    ? {
        label: '次にやること',
        title: 'まずゲーム開始を押してください',
        detail: '参加受付とラウンド進行を始める前に、ゲーム全体を開始する必要があります。',
        tone: 'border-emerald-400/25 bg-emerald-400/10',
      }
    : isVoting
      ? {
          label: '次にやること',
          title: '投票を締めて結果発表へ進めてください',
          detail: '現在は回答受付中です。結果を出すときは「投票を締めて結果発表」を押します。',
          tone: 'border-orange-400/25 bg-orange-400/10',
        }
      : activeQuestionRequest
        ? {
            label: '次にやること',
            title: `${activeQuestionRequest.participantName}さんの質問作成完了を待ってください`,
            detail: '依頼中は新しいラウンドを始められません。必要なら依頼を取り消してから進行します。',
            tone: 'border-amber-400/25 bg-amber-400/10',
          }
        : hasPendingBonusSelections
          ? {
              label: '次にやること',
              title: 'ボーナスマス選択が終わるまで待機してください',
              detail: `残り ${currentRound?.pendingBonusSelectorCount ?? 0} 人の選択が終わると次のラウンドへ進めます。`,
              tone: 'border-amber-400/25 bg-amber-400/10',
            }
          : {
              label: '次にやること',
              title: 'ラウンド出題欄から次の問題を準備してください',
              detail: '手入力、質問プール、新入社員の承認済み質問のどれでも使えます。',
              tone: 'border-sky-400/25 bg-sky-400/10',
            };
  const roundOperationNote = !hasActiveGame
    ? '先にゲーム開始が必要です。'
    : isVoting
      ? '投票中は先に結果発表へ進めてください。'
      : activeQuestionRequest
        ? '質問作成依頼中はラウンド開始できません。'
        : hasPendingBonusSelections
          ? 'ボーナスマス選択完了待ちです。'
          : 'ここが当日いちばんよく使う進行欄です。';

  return (
    <main className="min-h-screen bg-gray-950 p-4 text-white">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">ビンゴ管理画面</h1>
            <p className="text-sm text-gray-400">新歓ビンゴの進行と質問管理を行います。</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                'rounded-full px-3 py-1 text-xs font-bold',
                connected ? 'bg-green-800 text-green-300' : 'bg-red-800 text-red-300',
              )}
            >
              {connected ? '接続中' : '未接続'}
            </span>
            <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
              {gameState?.participantCount ?? 0}名参加中
            </span>
          </div>
        </div>

        {feedback && (
          <div className="rounded-xl bg-gray-800 px-4 py-2 text-center text-sm">
            {feedback}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <AdminMetricCard
              label="ゲーム状態"
              value={gameState?.status ? GAME_STATUS_LABELS[gameState.status] ?? gameState.status : '-'}
              detail={hasActiveGame ? '進行中のゲームです。' : '開始前またはリセット直後です。'}
              tone="emerald"
            />
            <AdminMetricCard
              label="参加者"
              value={`${gameState?.participantCount ?? 0}名`}
              detail={`新入社員 ${newEmployees.length}名 / 接続中 ${participants.filter((item) => item.connected).length}名`}
              tone="default"
            />
            <AdminMetricCard
              label="ラウンド"
              value={currentRound ? `第${currentRound.roundNumber}` : '-'}
              detail={
                currentRound
                  ? `${ROUND_STATUS_LABELS[currentRound.status] ?? currentRound.status} / 投票 ${currentRound.voteCount}票`
                  : `完了 ${gameState?.completedRounds.length ?? 0} ラウンド`
              }
              tone={isVoting ? 'amber' : 'default'}
            />
            <AdminMetricCard
              label="未使用問題"
              value={`${availableRandomPreparedQuestions.length}件`}
              detail={`多数派 ${activeMajorityPreparedQuestions.length}件 / クイズ ${activeQuizPreparedQuestions.length}件 / 総数 ${preparedQuestions.length}件`}
              tone="sky"
            />
          </section>

          <section
            className={clsx(
              'rounded-2xl border p-5 shadow-[0_18px_50px_rgba(0,0,0,0.2)] xl:sticky xl:top-4 xl:self-start',
              nextAction.tone,
            )}
          >
            <p className="text-[11px] font-semibold tracking-[0.08em] text-white/70">
              {nextAction.label}
            </p>
            <h2 className="mt-3 text-2xl font-bold text-white">
              {nextAction.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/85">{nextAction.detail}</p>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-xs leading-5 text-white/75">
              誤操作を減らすため、上から順に
              「進行の基本操作 → ラウンド出題 → 投稿質問や質問プール」
              の順で見ていく想定にしています。
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-2xl bg-gray-900 p-5 space-y-4">
            <div>
              <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">
                進行の基本操作
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                開始とリセットを分けて、押す場所を見分けやすくしています。
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_0.9fr]">
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-emerald-200">
                  開始
                </p>
                <p className="mt-2 text-lg font-bold text-white">参加受付を始める</p>
                <p className="mt-2 text-sm leading-6 text-emerald-100/80">
                  最初に1回だけ押します。開始後はラウンド出題欄から進行します。
                </p>
                <button
                  onClick={handleStartGame}
                  disabled={!canStartGame}
                  className="mt-4 w-full rounded-xl bg-green-600 py-3 font-bold text-white hover:bg-green-700 disabled:bg-gray-700"
                >
                  ゲーム開始
                </button>
              </div>

              <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-rose-200">
                  危険操作
                </p>
                <p className="mt-2 text-lg font-bold text-white">最初からやり直す</p>
                <p className="mt-2 text-sm leading-6 text-rose-100/80">
                  参加者状態、カード、進行状況を初期化します。やり直し時のみ使います。
                </p>
                <button
                  onClick={handleResetGame}
                  disabled={loading}
                  className="mt-4 w-full rounded-xl bg-red-700 py-3 font-bold text-white hover:bg-red-800 disabled:bg-gray-700"
                >
                  ゲームをリセット
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-400">
              状態:{' '}
              <strong className="text-white">
                {gameState?.status ? GAME_STATUS_LABELS[gameState.status] ?? gameState.status : '-'}
              </strong>
              {' / '}
              完了ラウンド:{' '}
              <strong className="text-white">{gameState?.completedRounds.length ?? 0}</strong>
            </p>
          </section>

          <section className="rounded-2xl bg-gray-900 p-5">
              <h2 className="mb-3 text-sm font-semibold tracking-[0.08em] text-gray-300">
                抽選済み番号
              </h2>
            <div className="flex flex-wrap gap-2">
              {(() => {
                const lastDrawn = gameState?.drawnNumbers.at(-1);
                return Array.from({ length: 75 }, (_, index) => index + 1).map((value) => {
                  const drawn = gameState?.drawnNumbers.includes(value);
                  const isLast = lastDrawn === value;
                  return (
                    <span
                      key={value}
                      className={clsx(
                        'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                        drawn
                          ? isLast
                            ? 'bg-yellow-400 text-gray-900'
                            : 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-400',
                      )}
                    >
                      {value}
                    </span>
                  );
                });
              })()}
            </div>
          </section>
        </div>

        <section className="rounded-2xl bg-gray-900 p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">
                質問作成依頼
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                新入社員の中から1人を選び、質問作成を依頼します。
              </p>
            </div>
            {activeQuestionRequest && (
              <button
                onClick={handleCancelCustomQuestionRequest}
                disabled={loading}
                className="rounded-xl bg-gray-700 px-4 py-2 text-sm font-bold text-white hover:bg-gray-600 disabled:bg-gray-800"
              >
                依頼を取り消す
              </button>
            )}
          </div>

          {activeQuestionRequest ? (
            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
                <p className="text-xs font-semibold tracking-[0.08em] text-amber-300">
                  依頼中
                </p>
              <p className="mt-2 text-lg font-bold text-white">
                {activeQuestionRequest.participantName}さんが質問を作成中です
              </p>
              <p className="mt-2 text-sm text-amber-100">
                完了すると承認待ち一覧へ移ります。必要なら取り消しもできます。
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-700 px-4 py-4 text-sm text-gray-400">
              現在、質問作成依頼は出していません。
            </div>
          )}

          {newEmployees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 px-4 py-5 text-sm text-gray-400">
              参加中の新入社員がまだいません。
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {newEmployees.map((participant) => (
                <div key={participant.id} className="rounded-2xl bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-white">{participant.name}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="rounded-full bg-purple-900/60 px-2 py-1 text-[11px] font-bold text-purple-200">
                          新入社員
                        </span>
                        <span
                          className={clsx(
                            'rounded-full px-2 py-1 text-[11px] font-bold',
                            participant.connected
                              ? 'bg-emerald-900/60 text-emerald-200'
                              : 'bg-gray-700 text-gray-300',
                          )}
                        >
                          {participant.connected ? '接続中' : '未接続'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRequestCustomQuestion(participant.id)}
                      disabled={loading || !!activeQuestionRequest || !participant.connected}
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:bg-gray-700"
                    >
                      依頼する
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {bonusRoundType === 'QUIZ' && (
            <p className="text-xs text-sky-300">
              クイズボーナスでは、投票中は正解を非表示にし、結果発表後に正解者だけへ好きなマスの選択権を配ります。
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-gray-900 p-5 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">
                質問プール
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                事前登録した質問から未使用のものをランダムで出題できます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-gray-300">
              <span className="rounded-full bg-gray-800 px-3 py-1">
                有効 {activePreparedQuestions.length}
              </span>
              <span className="rounded-full bg-gray-800 px-3 py-1">
                未使用 {availablePreparedQuestions.length}
              </span>
              <span className="rounded-full bg-gray-800 px-3 py-1">
                多数派 {activeMajorityPreparedQuestions.length}
              </span>
              <span className="rounded-full bg-gray-800 px-3 py-1">
                クイズ {activeQuizPreparedQuestions.length}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-gray-800/70 p-4 space-y-3">
              <p className="text-xs font-semibold tracking-[0.08em] text-sky-300">
                新規登録
              </p>
            <div className="flex flex-wrap gap-2">
              {MAJORITY_SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleLoadPreparedQuestionSample(preset)}
                  className="rounded-lg border border-white/10 bg-gray-900 px-3 py-2 text-xs font-bold text-white hover:border-sky-300/40"
                >
                  {preset.label}
                </button>
              ))}
              {QUIZ_SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleLoadPreparedQuizSample(preset)}
                  className="rounded-lg border border-sky-300/30 bg-sky-950/40 px-3 py-2 text-xs font-bold text-sky-100 hover:border-sky-300/60"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-[1.2fr_1fr]">
              <div className="rounded-xl border border-white/10 bg-gray-900 p-3">
                <p className="text-xs font-semibold tracking-[0.08em] text-gray-400">
                  問題種別
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['MAJORITY', 'QUIZ'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() =>
                        setPreparedQuestionInput((current) => ({
                          ...current,
                          kind,
                          correctChoice: kind === 'QUIZ' ? current.correctChoice : 'A',
                        }))
                      }
                      className={clsx(
                        'rounded-xl border px-3 py-3 text-sm font-bold transition',
                        preparedQuestionInput.kind === kind
                          ? 'border-sky-300 bg-sky-300 text-gray-950'
                          : 'border-white/10 bg-black/10 text-white hover:border-sky-300/40',
                      )}
                    >
                      {kind === 'MAJORITY' ? '多数派質問' : 'クイズ問題'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-gray-900 p-3 text-xs leading-5 text-gray-300">
                <p className="font-semibold tracking-[0.08em] text-gray-400">運用メモ</p>
                <p className="mt-2">
                  画像は <code>/question-assets/...</code> のように repo 内の公開パスで管理する想定です。
                </p>
                <p className="mt-2">
                  クイズ問題を登録した場合は、管理画面で反映すると自動でボーナス問題として読み込まれます。
                </p>
              </div>
            </div>
            <input
              type="text"
              value={preparedQuestionInput.question}
              onChange={(e) =>
                setPreparedQuestionInput((current) => ({
                  ...current,
                  question: e.target.value,
                }))
              }
              placeholder="質問文"
              className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={preparedQuestionInput.optionA}
                onChange={(e) =>
                  setPreparedQuestionInput((current) => ({
                    ...current,
                    optionA: e.target.value,
                  }))
                }
                placeholder="選択肢A"
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={preparedQuestionInput.optionB}
                onChange={(e) =>
                  setPreparedQuestionInput((current) => ({
                    ...current,
                    optionB: e.target.value,
                  }))
                }
                placeholder="選択肢B"
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {preparedQuestionInput.kind === 'QUIZ' && (
              <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-4 text-sm text-sky-100">
                <p className="text-xs font-semibold tracking-[0.08em] text-sky-200">
                  正解
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['A', 'B'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() =>
                        setPreparedQuestionInput((current) => ({
                          ...current,
                          correctChoice: choice,
                        }))
                      }
                      className={clsx(
                        'rounded-xl border px-4 py-3 text-sm font-bold transition',
                        preparedQuestionInput.correctChoice === choice
                          ? 'border-emerald-300 bg-emerald-300 text-gray-950'
                          : 'border-white/10 bg-gray-900 text-white hover:border-emerald-300/40',
                      )}
                    >
                      {choice === 'A'
                        ? `A: ${preparedQuestionInput.optionA || '選択肢A'}`
                        : `B: ${preparedQuestionInput.optionB || '選択肢B'}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <input
              type="text"
              value={preparedQuestionInput.imageUrl}
              onChange={(e) =>
                setPreparedQuestionInput((current) => ({
                  ...current,
                  imageUrl: e.target.value,
                }))
              }
              placeholder="画像URL（任意）"
              className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <input
                type="text"
                value={preparedQuestionInput.optionAImageUrl}
                onChange={(e) =>
                  setPreparedQuestionInput((current) => ({
                    ...current,
                    optionAImageUrl: e.target.value,
                  }))
                }
                placeholder="選択肢A画像URL"
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                value={preparedQuestionInput.optionBImageUrl}
                onChange={(e) =>
                  setPreparedQuestionInput((current) => ({
                    ...current,
                    optionBImageUrl: e.target.value,
                  }))
                }
                placeholder="選択肢B画像URL"
                className="w-full rounded-xl bg-gray-900 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleCreatePreparedQuestion}
              disabled={loading}
              className="w-full rounded-xl bg-indigo-600 py-2 font-bold text-white hover:bg-indigo-700 disabled:bg-gray-700"
            >
              プールに追加
            </button>
          </div>

          {preparedQuestions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-700 px-4 py-5 text-sm text-gray-400">
              まだ質問プールは登録されていません。
            </div>
          ) : (
            <div className="grid gap-3">
              {preparedQuestions.map((item) => (
                <div key={item.id} className="rounded-2xl bg-gray-800 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap gap-2">
                        <span
                          className={clsx(
                            'rounded-full px-2 py-1 text-[11px] font-bold',
                            item.isActive
                              ? 'bg-emerald-900/60 text-emerald-200'
                              : 'bg-gray-700 text-gray-300',
                          )}
                        >
                          {item.isActive ? '有効' : '非表示'}
                        </span>
                        <span
                          className={clsx(
                            'rounded-full px-2 py-1 text-[11px] font-bold',
                            item.usedInCurrentGame
                              ? 'bg-amber-900/60 text-amber-200'
                              : 'bg-sky-900/60 text-sky-200',
                          )}
                        >
                          {item.usedInCurrentGame ? '今回使用済み' : '未使用'}
                        </span>
                        <span className="rounded-full bg-gray-700 px-2 py-1 text-[11px] font-bold text-gray-200">
                          累計利用 {item.totalUseCount}
                        </span>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-white">{item.question}</p>
                      <p className="mt-2 text-xs text-gray-400">
                        A: {item.optionA} / B: {item.optionB}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-300">
                        <span
                          className={clsx(
                            'rounded-full px-2 py-1 font-bold',
                            item.kind === 'QUIZ'
                              ? 'bg-sky-900/60 text-sky-200'
                              : 'bg-fuchsia-900/60 text-fuchsia-200',
                          )}
                        >
                          {item.kind === 'QUIZ' ? 'クイズ問題' : '多数派質問'}
                        </span>
                        {item.kind === 'QUIZ' && item.correctChoice && (
                          <span className="rounded-full bg-emerald-900/60 px-2 py-1 font-bold text-emerald-200">
                            正解 {item.correctChoice}
                          </span>
                        )}
                        <span className="rounded-full bg-black/20 px-2 py-1 font-mono text-gray-400">
                          {item.slug}
                        </span>
                      </div>
                      {item.imageUrl && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                          <img
                            src={item.imageUrl}
                            alt="登録済み問題画像"
                            className="max-h-40 w-full object-cover"
                          />
                        </div>
                      )}
                      {(item.optionAImageUrl || item.optionBImageUrl) && (
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          {item.optionAImageUrl && (
                            <div className="overflow-hidden rounded-xl border border-white/10">
                              <img
                                src={item.optionAImageUrl}
                                alt="選択肢A画像"
                                className="h-32 w-full object-cover"
                              />
                            </div>
                          )}
                          {item.optionBImageUrl && (
                            <div className="overflow-hidden rounded-xl border border-white/10">
                              <img
                                src={item.optionBImageUrl}
                                alt="選択肢B画像"
                                className="h-32 w-full object-cover"
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        onClick={() => handleApplyPreparedQuestion(item)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                      >
                        出題フォームへ反映
                      </button>
                      <button
                        onClick={() => handleTogglePreparedQuestion(item)}
                        disabled={loading}
                        className="rounded-lg bg-gray-700 px-3 py-2 text-xs font-bold text-white hover:bg-gray-600 disabled:bg-gray-800"
                      >
                        {item.isActive ? '非表示' : '有効化'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-blue-500/20 bg-gray-900 p-5 space-y-3 shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-1 text-[11px] font-semibold tracking-[0.08em] text-blue-200">
                進行用
              </div>
              <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">
                新しいラウンド
              </h2>
              <p className="mt-1 text-sm text-gray-400">
                手入力出題も残しつつ、必要ならプールからランダム出題できます。
              </p>
            </div>
            <button
              onClick={handleStartRandomRound}
              disabled={!canStartRandomRound}
              className="rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-bold text-white hover:bg-fuchsia-700 disabled:bg-gray-700"
            >
              プールからランダム出題
            </button>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/10 px-4 py-3 text-xs leading-5 text-gray-300">
            {roundOperationNote}
          </div>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="質問文"
            className="w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-2">
            {QUESTION_SAMPLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleLoadQuestionSample(preset)}
                className="rounded-lg border border-white/10 bg-gray-800 px-3 py-2 text-xs font-bold text-white hover:border-blue-300/40"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={questionImageUrl}
            onChange={(e) => setQuestionImageUrl(e.target.value)}
            placeholder="質問画像URL"
            className="w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            <span>
              <strong className="font-bold text-white">ボーナスタイム</strong>
              <span className="ml-2 text-amber-100/80">
                結果発表後に、多数派だった参加者が好きなマスを1つ開けます。
              </span>
            </span>
            <input
              type="checkbox"
              checked={bonusRoundEnabled}
              onChange={(e) => setBonusRoundEnabled(e.target.checked)}
              className="h-5 w-5 rounded border-white/20 bg-gray-900 text-amber-400 focus:ring-amber-400"
            />
          </label>
          <div className="rounded-xl border border-sky-400/20 bg-sky-400/10 px-4 py-4 text-sm text-sky-100">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                  <p className="text-xs font-semibold tracking-[0.08em] text-sky-200">
                    ボーナス問題
                  </p>
                <p className="mt-1 text-xs leading-5 text-sky-100/85">
                  正解が決まっているボーナス問題に切り替えると、結果発表後に正解者だけが好きなマスを1つ開けられます。
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setBonusRoundType((current) => (current === 'QUIZ' ? 'NONE' : 'QUIZ'))
                }
                className={clsx(
                  'rounded-xl border px-4 py-3 text-sm font-bold transition',
                  bonusRoundType === 'QUIZ'
                    ? 'border-sky-300 bg-sky-300 text-gray-950'
                    : 'border-white/10 bg-gray-900 text-white hover:border-sky-300/40',
                )}
              >
                {bonusRoundType === 'QUIZ' ? 'ボーナス問題を解除' : 'ボーナス問題を使う'}
              </button>
            </div>
            {bonusRoundType === 'QUIZ' && (
              <div className="mt-4 rounded-xl border border-sky-300/20 bg-black/10 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <p className="text-xs font-semibold tracking-[0.08em] text-sky-200">
                      正解
                    </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleLoadQuizSample}
                      className="rounded-lg bg-sky-300 px-3 py-2 text-xs font-bold text-gray-950 hover:bg-sky-200"
                    >
                      ITサンプルを読み込む
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadAiQuizSample}
                      className="rounded-lg bg-sky-300 px-3 py-2 text-xs font-bold text-gray-950 hover:bg-sky-200"
                    >
                      AIサンプルを読み込む
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {(['A', 'B'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setCorrectChoice(choice)}
                      className={clsx(
                        'rounded-xl border px-4 py-3 text-sm font-bold transition',
                        correctChoice === choice
                          ? 'border-emerald-300 bg-emerald-300 text-gray-950'
                          : 'border-white/10 bg-gray-900 text-white hover:border-emerald-300/40',
                      )}
                    >
                      {choice === 'A'
                        ? `A: ${optionA || '選択肢A'}`
                        : `B: ${optionB || '選択肢B'}`}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-5 text-sky-100/80">
                  ランダム問題プールは正解情報を持っていないため、クイズボーナスでは使えません。
                </p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <input
              type="text"
              value={optionA}
              onChange={(e) => setOptionA(e.target.value)}
              placeholder="選択肢A"
              className="flex-1 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={optionB}
              onChange={(e) => setOptionB(e.target.value)}
              placeholder="選択肢B"
              className="flex-1 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={optionAImageUrl}
              onChange={(e) => setOptionAImageUrl(e.target.value)}
              placeholder="選択肢A画像URL"
              className="w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={optionBImageUrl}
              onChange={(e) => setOptionBImageUrl(e.target.value)}
              placeholder="選択肢B画像URL"
              className="w-full rounded-xl bg-gray-800 px-4 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
            <button
              onClick={handleManualRoundStart}
              disabled={!canStartManualRound}
              className="w-full rounded-xl bg-blue-600 py-2 font-bold text-white hover:bg-blue-700 disabled:bg-gray-700"
            >
              {startRoundButtonLabel}
            </button>
          {hasPendingBonusSelections && (
            <p className="text-xs text-amber-300">
              ボーナスタイムのマス選択が完了するまで、次のラウンドは開始できません。
            </p>
          )}
          {activeQuestionRequest && (
            <p className="text-xs text-amber-300">
              質問作成依頼中はラウンドを開始できません。
            </p>
          )}
          {!activeQuestionRequest && availableRandomPreparedQuestions.length === 0 && (
            <p className="text-xs text-amber-300">
              今のゲームで使える未使用の多数派質問プールがありません。
            </p>
          )}
          {!canStartManualRound && !activeQuestionRequest && !hasPendingBonusSelections && !hasActiveGame && (
            <p className="text-xs text-amber-300">
              この欄を使う前にゲーム開始を押してください。
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-gray-900 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">
              投稿質問
            </h2>
            <span className="rounded-full bg-gray-800 px-3 py-1 text-xs text-gray-300">
              未承認 {pendingQuestions.length} / 承認済み {approvedQuestions.length}
            </span>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.08em] text-amber-300">
              承認待ち
            </p>
            {pendingQuestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-700 px-4 py-5 text-sm text-gray-400">
                承認待ちの質問はありません。
              </div>
            ) : (
              pendingQuestions.map((item) => (
                <div key={item.id} className="rounded-2xl bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium tracking-[0.08em] text-gray-400">
                        {item.participantName}
                      </p>
                      <p className="mt-2 text-sm text-white">{item.question}</p>
                      <p className="mt-3 text-xs text-gray-400">
                        A: {item.optionA} / B: {item.optionB}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveCustomQuestion(item.id)}
                        disabled={loading}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:bg-gray-700"
                      >
                        承認
                      </button>
                      <button
                        onClick={() => handleRejectCustomQuestion(item.id)}
                        disabled={loading}
                        className="rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:bg-gray-700"
                      >
                        却下
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.08em] text-sky-300">
              承認済み
            </p>
            {approvedQuestions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-700 px-4 py-5 text-sm text-gray-400">
                承認済みの質問はまだありません。
              </div>
            ) : (
              approvedQuestions.map((item) => (
                <div key={item.id} className="rounded-2xl bg-gray-800 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium tracking-[0.08em] text-gray-400">
                        {item.participantName}
                      </p>
                      <p className="mt-2 text-sm text-white">{item.question}</p>
                      <p className="mt-3 text-xs text-gray-400">
                        A: {item.optionA} / B: {item.optionB}
                      </p>
                    </div>
                    <button
                      onClick={() => handleApplyApprovedQuestion(item)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
                    >
                      使う
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {currentRound &&
          (currentRound.status !== 'COMPLETED' || hasPendingBonusSelections) && (
          <section className="rounded-2xl bg-gray-900 p-5 space-y-3">
            <h2 className="text-sm font-semibold tracking-[0.08em] text-gray-300">
              ラウンド {currentRound.roundNumber} /{' '}
              {currentRound.drawnNumber == null
                ? '...'
                : currentRound.isBonusRound
                  ? '★'
                  : `#${currentRound.drawnNumber}`}
            </h2>
            <p className="text-sm text-gray-300">{currentRound.question}</p>
            <div className="flex gap-4 text-sm text-gray-400">
              <span>A: {currentRound.optionA}</span>
              <span>B: {currentRound.optionB}</span>
            </div>
            <p className="text-sm">
              投票数: <strong>{currentRound.voteCount}</strong>
              {' / '}
              {gameState?.participantCount}
              <span className="ml-2 text-xs text-gray-400">
                ({ROUND_STATUS_LABELS[currentRound.status] ?? currentRound.status})
              </span>
            </p>
            {currentRound.isBonusRound && currentRound.pendingBonusSelectorCount > 0 && (
              <p className="text-sm text-amber-300">
                ボーナスタイムの対象者がマスを選択中です。
                {' '}
                残り {currentRound.pendingBonusSelectorCount} 人
              </p>
            )}
            <button
              onClick={handleCloseVoting}
              disabled={loading || !isVoting}
              className="w-full rounded-xl bg-orange-600 py-2 font-bold text-white hover:bg-orange-700 disabled:bg-gray-700"
            >
              投票を締めて結果発表
            </button>
          </section>
        )}

        {gameState && gameState.completedRounds.length > 0 && (() => {
          const last = gameState.completedRounds[gameState.completedRounds.length - 1];
          return (
            <section className="rounded-2xl bg-gray-900 p-5">
              <h2 className="mb-2 text-sm font-semibold tracking-[0.08em] text-gray-300">
                直前ラウンド結果
              </h2>
              <p className="text-sm text-gray-300">{last.question}</p>
              <p className="mt-1 text-sm">
                多数派: <strong className="text-yellow-400">{last.majorityVote ?? '引き分け'}</strong>
                {' / '}
                抽選結果:{' '}
                <strong className="text-blue-400">
                  {last.isBonusRound ? '★' : `#${last.drawnNumber}`}
                </strong>
                {' / '}
                {last.voteCount}票
              </p>
            </section>
          );
        })()}

        {winners.length > 0 && (
          <section className="rounded-2xl bg-yellow-950 p-5">
            <h2 className="mb-2 text-sm font-semibold tracking-[0.08em] text-yellow-300">
              ビンゴ達成者
            </h2>
            <ul className="space-y-1">
              {winners.map((winner) => (
                <li key={winner.id} className="text-sm text-yellow-100">
                  {winner.name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
