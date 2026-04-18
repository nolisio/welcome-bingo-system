"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { getSocket } from "@/lib/socket";
import { ParticipantRound, ParticipantState, VoteChoice } from "@/types/game";
import BingoCard from "@/components/bingo/BingoCard";
import VotePanel from "@/components/game/VotePanel";

const SESSION_KEY = "bingo_session";
const NAME_KEY = "bingo_name";

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
  if (typeof window === "undefined") return "";
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

function getRoundOutcome(round: ParticipantRound | null) {
  if (!round) {
    return {
      choice: null as VoteChoice | null,
      label: null as string | null,
      descriptor: "多数派",
      isQuizBonus: false,
      isQuiz: false,
    };
  }

  // サーバーから送られるisQuizフラグを使う（投票中はcorrectChoiceがnullに隠されるため）
  const isQuiz = round.isQuiz;
  const choice = isQuiz ? round.correctChoice : round.majorityVote;
  const label =
    choice === "A" ? round.optionA : choice === "B" ? round.optionB : null;

  return {
    choice,
    label,
    descriptor: isQuiz ? "正解" : "多数派",
    isQuizBonus: round.bonusRoundType === "QUIZ",
    isQuiz,
  };
}

function getRoundTypeLabel(round: ParticipantRound | null): string | null {
  if (!round) return null;
  if (round.isQuiz) return "クイズ";
  if (round.isBonusRound) return "ボーナス多数決";
  return "多数決";
}

function getStatusMessage(
  round: ParticipantRound | null,
  currentVote: VoteChoice | null,
  myCardHasDrawn: boolean,
  iOpenedACell: boolean,
  canChooseBonusCell: boolean,
  customQuestionRequest: ParticipantState["customQuestionRequest"],
  isRequestedAuthor: boolean,
): { text: string; tone: "idle" | "vote" | "result" | "bonus" | "wait" } {
  if (customQuestionRequest && !isRequestedAuthor) {
    return {
      text: `${customQuestionRequest.participantName}さんが質問を作成中...`,
      tone: "wait",
    };
  }

  if (!round) {
    return { text: "次のラウンドを待っています...", tone: "idle" };
  }

  if (round.status === "VOTING") {
    return currentVote
      ? { text: "投票済み - 結果発表をお待ちください", tone: "vote" }
      : { text: "質問に回答してください！", tone: "vote" };
  }

  if (round.status === "COMPLETED") {
    if (round.isBonusRound) {
      if (canChooseBonusCell) {
        return { text: "ボーナス！好きなマスを1つ選べます", tone: "bonus" };
      }
      if (round.pendingBonusSelectorCount > 0) {
        return {
          text: "ボーナス選択中...しばらくお待ちください",
          tone: "wait",
        };
      }
      if (iOpenedACell) {
        return { text: "ボーナスでマスが開きました！", tone: "result" };
      }
      return { text: "ボーナス対象外でした", tone: "result" };
    }

    if (iOpenedACell) {
      return { text: "マスが開きました！", tone: "result" };
    }
    if (myCardHasDrawn) {
      return {
        text: "カードに数字がありましたが、開きませんでした",
        tone: "result",
      };
    }
    return { text: "今回はハズレでした", tone: "result" };
  }

  return { text: "結果を集計中...", tone: "wait" };
}

/* ── Ambient background orbs ── */
function AmbientOrbs() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="animate-float absolute -left-32 -top-32 h-80 w-80 rounded-full bg-purple-600/[0.07] blur-[100px]" />
      <div className="animate-float-slow absolute -right-24 top-1/3 h-64 w-64 rounded-full bg-violet-500/[0.06] blur-[80px]" />
      <div className="animate-float absolute -bottom-20 left-1/4 h-72 w-72 rounded-full bg-indigo-600/[0.05] blur-[90px]" />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative min-h-[100dvh] bg-[#0a0612] text-slate-100"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <AmbientOrbs />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-md flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[11px] font-medium",
        connected ? "text-emerald-400" : "text-slate-500",
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          connected
            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
            : "bg-slate-600 animate-pulse",
        )}
      />
      {connected ? "LIVE" : "接続中..."}
    </span>
  );
}

/* ── Progress ring (mini donut) for bingo progress ── */
function ProgressRing({ opened, total }: { opened: number; total: number }) {
  const pct = (opened / total) * 100;
  const r = 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width="36" height="36" className="shrink-0 -rotate-90">
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="rgba(139,92,246,0.15)"
        strokeWidth="3"
      />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        stroke="url(#ring-grad)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        className="transition-all duration-700 ease-out"
      />
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#6366f1" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── History Drawer ── */
function HistoryDrawer({
  drawnNumbers,
  cardNumbers,
  openedCells,
  onClose,
}: {
  drawnNumbers: number[];
  cardNumbers: number[];
  openedCells: number;
  onClose: () => void;
}) {
  const cardSet = new Set(cardNumbers);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-slide-up mx-auto w-full max-w-md rounded-t-3xl border-t border-purple-500/15 bg-gradient-to-b from-[#150b24] to-[#0d0618] px-5 pb-10 pt-5 shadow-[0_-16px_64px_rgba(0,0,0,0.5)]">
        {/* Handle bar */}
        <div className="mb-4 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-white/10" />
        </div>

        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">出た番号</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-400 ring-1 ring-white/10 transition hover:bg-white/10"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {drawnNumbers.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            まだ番号が出ていません
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {drawnNumbers.map((num, i) => {
              const onMyCard = cardSet.has(num);
              const cellIdx = cardNumbers.indexOf(num);
              const isOpened = cellIdx >= 0 && isCellOpen(openedCells, cellIdx);

              return (
                <div
                  key={`${num}-${i}`}
                  className={clsx(
                    "flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold transition-all",
                    isOpened
                      ? "bg-gradient-to-br from-purple-600 to-violet-700 text-white shadow-[0_0_12px_rgba(139,92,246,0.3)]"
                      : onMyCard
                        ? "bg-purple-500/15 text-purple-300 ring-1 ring-purple-400/25"
                        : "bg-white/[0.03] text-slate-600 ring-1 ring-white/[0.06]",
                  )}
                >
                  {num}
                </div>
              );
            })}
          </div>
        )}

        {/* Legend */}
        <div className="mt-5 flex items-center gap-5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-gradient-to-br from-purple-600 to-violet-700" />
            開いた
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-purple-500/15 ring-1 ring-purple-400/25" />
            カードにある
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-white/[0.03] ring-1 ring-white/[0.06]" />
            なし
          </span>
        </div>
      </div>
    </div>
  );
}

export default function ParticipantPage() {
  const [name, setName] = useState("");
  const [isNewEmployee, setIsNewEmployee] = useState(false);
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<ParticipantState | null>(null);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [bingoAnnouncement, setBingoAnnouncement] = useState<string | null>(
    null,
  );
  const [customQuestion, setCustomQuestion] = useState("");
  const [customOptionA, setCustomOptionA] = useState("");
  const [customOptionB, setCustomOptionB] = useState("");
  const [customQuestionFeedback, setCustomQuestionFeedback] = useState("");
  const [customQuestionLoading, setCustomQuestionLoading] = useState(false);
  const [bonusSelection, setBonusSelection] = useState<number | null>(null);
  const [bonusFeedback, setBonusFeedback] = useState("");
  const [bonusLoading, setBonusLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const bingoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
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
        socket.emit("participant:reconnect", { sessionId }, (res: any) => {
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
      bingoTimerRef.current = setTimeout(
        () => setBingoAnnouncement(null),
        8000,
      );
    };
    const onGameReset = () => {
      setJoined(false);
      setState(null);
      setError("");
      setCustomQuestion("");
      setCustomOptionA("");
      setCustomOptionB("");
      setCustomQuestionFeedback("");
      setBonusSelection(null);
      setBonusFeedback("");
      setBonusLoading(false);
      setBingoAnnouncement(null);
      setShowHistory(false);
      localStorage.removeItem(NAME_KEY);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("participant:state", onParticipantState);
    socket.on("bingo:winner", onBingoWinner);
    socket.on("game:reset", onGameReset);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("participant:state", onParticipantState);
      socket.off("bingo:winner", onBingoWinner);
      socket.off("game:reset", onGameReset);
      if (bingoTimerRef.current) clearTimeout(bingoTimerRef.current);
    };
  }, []);

  const activeCustomQuestionRequest = state?.customQuestionRequest ?? null;
  const isRequestedAuthor =
    !!state &&
    !!activeCustomQuestionRequest &&
    activeCustomQuestionRequest.participantId === state.id;
  const showVoteOverlay = state?.currentRound?.status === "VOTING";
  const showCustomQuestionOverlay = !!isRequestedAuthor;
  const showBonusOverlay = !!state?.canChooseBonusCell;

  useEffect(() => {
    if (!showCustomQuestionOverlay) return;
    setCustomQuestion("");
    setCustomOptionA("");
    setCustomOptionB("");
    setCustomQuestionFeedback("");
  }, [showCustomQuestionOverlay, activeCustomQuestionRequest?.requestedAt]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    if (
      showVoteOverlay ||
      showCustomQuestionOverlay ||
      showBonusOverlay ||
      showHistory
    ) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [
    showVoteOverlay,
    showCustomQuestionOverlay,
    showBonusOverlay,
    showHistory,
  ]);

  useEffect(() => {
    if (!showBonusOverlay) {
      setBonusSelection(null);
      setBonusLoading(false);
      return;
    }

    setBonusSelection(null);
    setBonusFeedback("");
    setBonusLoading(false);
  }, [showBonusOverlay, state?.currentRound?.id]);

  const handleJoin = () => {
    if (!name.trim()) {
      setError("表示名を入力してください。");
      return;
    }

    const socket = getSocket();
    const sessionId = getOrCreateSessionId();
    const trimmedName = name.trim();

    localStorage.setItem(NAME_KEY, trimmedName);
    socket.emit(
      "participant:join",
      { name: trimmedName, sessionId, isNewEmployee },
      (res: any) => {
        if (res?.ok) {
          setJoined(true);
          setError("");
        } else {
          setError(res?.error || "参加に失敗しました。");
        }
      },
    );
  };

  const handleVote = (choice: VoteChoice) => {
    const socket = getSocket();
    socket.emit("vote:submit", { choice }, (res: any) => {
      if (!res?.ok) {
        setError(res?.error || "投票に失敗しました。");
      }
    });
  };

  const handleSubmitCustomQuestion = () => {
    if (
      !customQuestion.trim() ||
      !customOptionA.trim() ||
      !customOptionB.trim()
    ) {
      setCustomQuestionFeedback("質問文と2つの選択肢を入力してください。");
      return;
    }

    const socket = getSocket();
    setCustomQuestionLoading(true);
    socket.emit(
      "custom-question:submit",
      {
        question: customQuestion.trim(),
        optionA: customOptionA.trim(),
        optionB: customOptionB.trim(),
      },
      (res: any) => {
        setCustomQuestionLoading(false);
        if (res?.ok) {
          setCustomQuestion("");
          setCustomOptionA("");
          setCustomOptionB("");
          setCustomQuestionFeedback(
            "送信しました！管理者の確認をお待ちください。",
          );
        } else {
          setCustomQuestionFeedback(res?.error || "送信に失敗しました。");
        }
      },
    );
  };

  const handleSubmitBonusCell = () => {
    if (bonusSelection == null) {
      setBonusFeedback("マスを1つ選んでください。");
      return;
    }

    const socket = getSocket();
    setBonusLoading(true);
    socket.emit(
      "bonus-cell:select",
      { cellIndex: bonusSelection },
      (res: any) => {
        setBonusLoading(false);
        if (res?.ok) {
          setBonusFeedback("");
          setBonusSelection(null);
        } else {
          setBonusFeedback(res?.error || "選択に失敗しました。");
        }
      },
    );
  };

  // ━━━━━━━━━━ Join Screen ━━━━━━━━━━
  if (!joined) {
    return (
      <Shell>
        <main className="flex flex-1 flex-col justify-center px-6 py-8">
          {/* ── Welcome header ── */}
          <div className="mb-10 text-center animate-slide-up">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-purple-400/70">
              Welcome to the Star System
            </p>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-tight text-white">
              ビンゴ大会
            </h1>
            <div className="mx-auto mt-5 h-px w-16 bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
            <p className="mt-4 text-sm leading-relaxed text-slate-500">
              2択に正解して、ビンゴを目指しましょう！！
            </p>
            <div className="mt-3">
              <StatusDot connected={connected} />
            </div>
          </div>

          {/* ── Form card ── */}
          <div
            className="animate-slide-up rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.3)] backdrop-blur"
            style={{ animationDelay: "0.1s", animationFillMode: "both" }}
          >
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              氏名
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
              placeholder="名前を入力"
              className="mt-2 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-base text-white outline-none transition placeholder:text-slate-600 focus:border-purple-500/30 focus:bg-white/[0.05] focus:ring-2 focus:ring-purple-500/15"
              maxLength={40}
            />

            <div className="mt-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                新入社員ですか？
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {[
                  { val: true, label: "はい" },
                  { val: false, label: "いいえ" },
                ].map(({ val, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setIsNewEmployee(val)}
                    className={clsx(
                      "rounded-xl border px-4 py-2.5 text-sm font-bold transition-all duration-200",
                      isNewEmployee === val
                        ? "border-purple-500/30 bg-purple-500/15 text-purple-200 shadow-[0_2px_12px_rgba(139,92,246,0.15)]"
                        : "border-white/[0.06] bg-white/[0.02] text-slate-500 hover:bg-white/[0.04]",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isNewEmployee && (
                <p className="mt-2 text-xs text-purple-400/50">
                  中央マスが最初から開きます
                </p>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            )}

            <button
              onClick={handleJoin}
              disabled={!connected}
              className={clsx(
                "mt-5 w-full rounded-xl px-4 py-3.5 text-base font-bold text-white transition-all duration-300",
                connected
                  ? "bg-gradient-to-r from-purple-600 to-violet-600 shadow-[0_8px_24px_rgba(139,92,246,0.25)] hover:shadow-[0_12px_32px_rgba(139,92,246,0.35)] active:scale-[0.98]"
                  : "cursor-not-allowed bg-slate-800 text-slate-500",
              )}
            >
              {connected ? "参加する" : "接続中..."}
            </button>
          </div>

          {/* ── Rule hint ── */}
          <div
            className="mt-8 animate-slide-up flex items-center justify-center gap-6 text-[11px] text-slate-600"
            style={{ animationDelay: "0.2s", animationFillMode: "both" }}
          >
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.04] text-[10px] text-slate-500 ring-1 ring-white/[0.06]">
                1
              </span>
              2択に回答
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.04] text-[10px] text-slate-500 ring-1 ring-white/[0.06]">
                2
              </span>
              多数派ならマスが開く
            </span>
            <span className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/[0.04] text-[10px] text-slate-500 ring-1 ring-white/[0.06]">
                3
              </span>
              5つ揃えばBINGO
            </span>
          </div>
        </main>
      </Shell>
    );
  }

  // ━━━━━━━━━━ Loading ━━━━━━━━━━
  if (!state) {
    return (
      <Shell>
        <main className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="text-center animate-slide-up">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-[3px] border-purple-500/20 border-t-purple-500" />
            <p className="mt-5 text-sm text-slate-500">カードを準備中...</p>
          </div>
        </main>
      </Shell>
    );
  }

  // ━━━━━━━━━━ Game Screen ━━━━━━━━━━
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
  const roundOutcome = getRoundOutcome(round);
  const roundTypeLabel = getRoundTypeLabel(round);
  const status = getStatusMessage(
    round,
    state.currentVote,
    myCardHasDrawn,
    iOpenedACell,
    !!state.canChooseBonusCell,
    activeCustomQuestionRequest,
    isRequestedAuthor,
  );

  const statusStyles = {
    idle: "from-white/[0.03] to-transparent text-slate-400 border-white/[0.04]",
    vote: "from-purple-500/10 to-transparent text-purple-300 border-purple-500/15",
    result:
      "from-emerald-500/10 to-transparent text-emerald-300 border-emerald-500/15",
    bonus:
      "from-amber-500/10 to-transparent text-amber-300 border-amber-500/15",
    wait: "from-white/[0.03] to-transparent text-slate-400 border-white/[0.04]",
  }[status.tone];

  const drawnNumbers = state.drawnNumbers ?? [];

  return (
    <>
      <Shell>
        {/* ── Bingo winner announcement ── */}
        {bingoAnnouncement && (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-50 flex justify-center px-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
          >
            <div className="animate-pop-in w-full max-w-md rounded-2xl border border-amber-400/20 bg-gradient-to-r from-amber-600/90 to-orange-600/90 px-5 py-5 text-center shadow-[0_16px_48px_rgba(245,158,11,0.3)] backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-200/70">
                BINGO!
              </p>
              <p className="mt-1 text-xl font-black text-white">
                {bingoAnnouncement}
              </p>
            </div>
          </div>
        )}

        {/* ── Custom question overlay ── */}
        {showCustomQuestionOverlay && activeCustomQuestionRequest && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-40 overflow-y-auto bg-black/70 backdrop-blur-sm"
          >
            <div
              className="flex min-h-full items-center justify-center px-4 py-6"
              style={{
                paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
              }}
            >
              <div className="animate-slide-up w-full max-w-md rounded-2xl border border-purple-500/15 bg-gradient-to-b from-[#150b24] to-[#0d0618] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
                <h2 className="text-lg font-bold text-white">
                  2択の質問を作ってください
                </h2>
                <div className="mt-4 space-y-3">
                  <input
                    type="text"
                    value={customQuestion}
                    onChange={(e) => setCustomQuestion(e.target.value)}
                    placeholder="質問文"
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/20"
                    maxLength={120}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={customOptionA}
                      onChange={(e) => setCustomOptionA(e.target.value)}
                      placeholder="選択肢 A"
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/20"
                      maxLength={40}
                    />
                    <input
                      type="text"
                      value={customOptionB}
                      onChange={(e) => setCustomOptionB(e.target.value)}
                      placeholder="選択肢 B"
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-purple-500/40 focus:ring-2 focus:ring-purple-500/20"
                      maxLength={40}
                    />
                  </div>
                  <button
                    onClick={handleSubmitCustomQuestion}
                    disabled={customQuestionLoading}
                    className="w-full rounded-xl bg-gradient-to-r from-purple-600 to-violet-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
                  >
                    {customQuestionLoading ? "送信中..." : "送信する"}
                  </button>
                </div>
                {customQuestionFeedback && (
                  <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                    {customQuestionFeedback}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Vote overlay ── */}
        {showVoteOverlay && round && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-40 overflow-y-auto bg-black/70 backdrop-blur-sm"
          >
            <div
              className="flex min-h-full items-center justify-center px-4 py-6"
              style={{
                paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
              }}
            >
              <div className="w-full max-w-md">
                {round.questionImageUrl && (
                  <div className="mb-3 overflow-hidden rounded-2xl ring-1 ring-white/10 animate-slide-up">
                    <img
                      src={round.questionImageUrl}
                      alt="質問画像"
                      className="max-h-40 w-full object-cover"
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
                  roundTypeLabel={roundTypeLabel}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Bonus overlay ── */}
        {showBonusOverlay && round && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-40 overflow-y-auto bg-black/70 backdrop-blur-sm"
          >
            <div
              className="flex min-h-full items-center justify-center px-4 py-6"
              style={{
                paddingTop: "calc(env(safe-area-inset-top) + 1rem)",
                paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)",
              }}
            >
              <div className="animate-slide-up w-full max-w-md rounded-2xl border border-amber-400/15 bg-gradient-to-b from-[#1a1020] to-[#0d0618] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
                <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-400 ring-1 ring-amber-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]" />
                  ボーナス
                </div>
                <h2 className="mt-2 text-lg font-bold text-white">
                  好きなマスを選ぼう
                </h2>
                <p className="mt-1 text-sm text-slate-400">タップして確定</p>

                <div className="mt-4">
                  <BingoCard
                    card={state.card}
                    size="md"
                    selectableCellIndexes={bonusSelectableIndexes}
                    selectedCellIndex={bonusSelection}
                    onCellClick={setBonusSelection}
                  />
                </div>

                <button
                  onClick={handleSubmitBonusCell}
                  disabled={bonusLoading || bonusSelection == null}
                  className="mt-4 w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3.5 text-sm font-bold text-slate-950 shadow-lg transition active:scale-[0.98] disabled:cursor-not-allowed disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:shadow-none"
                >
                  {bonusLoading
                    ? "確定中..."
                    : bonusSelection != null
                      ? `${state.card.numbers[bonusSelection]}番を開ける`
                      : "マスを選んでください"}
                </button>

                {bonusFeedback && (
                  <p className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                    {bonusFeedback}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━ Main game content ━━━━━━━━━━ */}
        <main className="flex flex-1 min-h-0 flex-col overflow-hidden">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Avatar initial */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-violet-700 text-sm font-black text-white shadow-[0_4px_12px_rgba(139,92,246,0.3)]">
                {state.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-bold text-white">
                  {state.name}
                </h1>
                <StatusDot connected={connected} />
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {state.hasBingo && (
                <span className="animate-pop-in rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-slate-950 shadow-[0_4px_16px_rgba(245,158,11,0.4)]">
                  BINGO!
                </span>
              )}
              {/* Progress ring + counts */}
              <div className="relative">
                <ProgressRing opened={openedCount} total={25} />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-purple-300">
                  {openedCount}
                </span>
              </div>
              {/* History button */}
              <button
                onClick={() => setShowHistory(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.04] text-slate-400 ring-1 ring-white/[0.06] transition hover:bg-white/[0.08]"
                title="出た番号の履歴"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Status bar (VOTING / WAITING / etc.) ── */}
          {round?.status !== "COMPLETED" && (
            <div
              className={clsx(
                "mx-4 mb-3 flex items-center justify-center gap-2 rounded-xl border bg-gradient-to-r px-4 py-2 text-sm font-medium",
                statusStyles,
              )}
            >
              {roundTypeLabel && round?.status !== "VOTING" && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1",
                    round?.bonusRoundType === "QUIZ" || round?.isBonusRound
                      ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                      : "bg-white/[0.04] text-slate-500 ring-white/[0.06]",
                  )}
                >
                  {roundTypeLabel}
                </span>
              )}
              {status.text}
            </div>
          )}

          {/* ── Bingo card (hero) ── */}
          <div className="flex flex-1 min-h-0 flex-col px-4">
            {/* ── Result panel (COMPLETED, above bingo card) ── */}
            {round?.status === "COMPLETED" &&
              !showVoteOverlay &&
              (() => {
                const myVote = state.currentVote ?? round.myVote;
                const isQuiz = roundOutcome.isQuiz;
                // 同票（多数決で引き分け）: 投票した全員が勝者
                const isTie = !isQuiz && round.majorityVote === null;
                const isCorrect = isTie ? !!myVote : myVote === roundOutcome.choice;

                // サマリーをパーツに分解: { text, green } の配列
                type Part = { text: string; green: boolean };
                let parts: Part[] = [];

                if (round.isBonusRound) {
                  if (isQuiz) {
                    if (isCorrect) {
                      parts = [
                        {
                          text: "ボーナス！好きなマスを1つ選べます",
                          green: true,
                        },
                      ];
                    } else {
                      parts = [{ text: "不正解でした", green: false }];
                    }
                  } else {
                    const isBonusWinner =
                      isCorrect || iOpenedACell;
                    parts = [
                      {
                        text: iOpenedACell
                          ? "ボーナスでマスが開きました！"
                          : isBonusWinner
                            ? isTie
                              ? "同票！全員ボーナス！好きなマスを1つ選べます"
                              : "ボーナス！好きなマスを1つ選べます"
                            : "少数派でした",
                        green: isBonusWinner,
                      },
                    ];
                  }
                } else if (myVote) {
                  const num = round.drawnNumber;
                  if (isQuiz) {
                    if (isCorrect && myCardHasDrawn) {
                      parts = [
                        {
                          text: `正解！${num}番のマスが開きました！`,
                          green: true,
                        },
                      ];
                    } else if (isCorrect && !myCardHasDrawn) {
                      parts = [
                        { text: "正解でしたが、", green: true },
                        {
                          text: `${num}番はシートにありませんでした`,
                          green: false,
                        },
                      ];
                    } else if (!isCorrect && myCardHasDrawn) {
                      parts = [
                        {
                          text: `不正解でしたが、${num}番はシートにありました`,
                          green: false,
                        },
                      ];
                    } else {
                      parts = [
                        {
                          text: `不正解でした。${num}番はシートにありませんでした`,
                          green: false,
                        },
                      ];
                    }
                  } else {
                    const winLabel = isTie ? "同票" : "多数派";
                    const loseLabel = "少数派";
                    if (isCorrect && myCardHasDrawn) {
                      parts = [
                        {
                          text: `${isTie ? "同票でした" : "あなたは多数派でした"}。${num}番のマスが開きました！`,
                          green: true,
                        },
                      ];
                    } else if (isCorrect && !myCardHasDrawn) {
                      parts = [
                        { text: `${isTie ? "同票でしたが、" : "あなたは多数派でしたが、"}`, green: true },
                        {
                          text: `${num}番はシートにありませんでした`,
                          green: false,
                        },
                      ];
                    } else if (!isCorrect && myCardHasDrawn) {
                      parts = [
                        {
                          text: `あなたは${loseLabel}でした。${num}番はシートにありましたが開きません`,
                          green: false,
                        },
                      ];
                    } else {
                      parts = [
                        {
                          text: `あなたは${loseLabel}でした。${num}番はシートにありませんでした`,
                          green: false,
                        },
                      ];
                    }
                  }
                } else if (round.drawnNumber) {
                  parts = [
                    {
                      text: `今回の番号は ${round.drawnNumber} でした`,
                      green: false,
                    },
                  ];
                }

                return (
                  <div className="mb-3 animate-slide-up rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 backdrop-blur">
                    {/* Round type badge */}
                    {!round.isBonusRound && (
                      <div className="mb-2">
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold ring-1",
                            isQuiz
                              ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                              : "bg-white/[0.04] text-slate-500 ring-white/[0.06]",
                          )}
                        >
                          {isQuiz ? "クイズ" : "多数決"}
                        </span>
                      </div>
                    )}
                    {/* A/B choices */}
                    {roundOutcome.label && (
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        {(["A", "B"] as const).map((choice) => {
                          const label =
                            choice === "A" ? round.optionA : round.optionB;
                          const choiceIsMajority =
                            roundOutcome.choice === choice;
                          const choiceIsMyVote = myVote === choice;
                          return (
                            <div
                              key={choice}
                              className={clsx(
                                "rounded-lg px-3 py-2 ring-1",
                                choiceIsMajority && choiceIsMyVote
                                  ? "bg-emerald-500/15 ring-emerald-500/40"
                                  : choiceIsMajority
                                    ? "bg-white/[0.05] ring-white/15"
                                    : choiceIsMyVote
                                      ? "bg-rose-500/10 ring-rose-500/30"
                                      : "bg-white/[0.02] ring-white/[0.05]",
                              )}
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={clsx(
                                    "shrink-0 text-[10px] font-black",
                                    choiceIsMajority && choiceIsMyVote
                                      ? "text-emerald-400"
                                      : choiceIsMajority
                                        ? "text-slate-300"
                                        : choiceIsMyVote
                                          ? "text-rose-400"
                                          : "text-slate-600",
                                  )}
                                >
                                  {choice}
                                </span>
                                <span className="truncate text-xs font-medium text-slate-200">
                                  {label}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1">
                                {choiceIsMajority && (
                                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-slate-300">
                                    {roundOutcome.descriptor}
                                  </span>
                                )}
                                {choiceIsMyVote && (
                                  <span
                                    className={clsx(
                                      "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                                      choiceIsMajority
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-rose-500/20 text-rose-400",
                                    )}
                                  >
                                    あなた
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Unified summary sentence */}
                    {parts.length > 0 && (
                      <p className="text-sm font-semibold">
                        {parts.map((part, i) => (
                          <span
                            key={i}
                            className={
                              part.green ? "text-emerald-400" : "text-rose-400"
                            }
                          >
                            {part.text}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                );
              })()}

            <div className="flex min-h-0 flex-1 items-center justify-center">
              <div className="w-full max-w-[22rem]">
                <BingoCard
                  card={state.card}
                  highlightNumber={
                    round && !round.isBonusRound
                      ? (round.drawnNumber ?? undefined)
                      : undefined
                  }
                  size="sm"
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="px-4 pb-3">
              <p className="rounded-xl border border-rose-500/15 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </p>
            </div>
          )}
        </main>
      </Shell>

      {/* ── History drawer (outside Shell to avoid overflow-hidden clipping) ── */}
      {showHistory && (
        <HistoryDrawer
          drawnNumbers={drawnNumbers}
          cardNumbers={state.card.numbers}
          openedCells={state.card.openedCells}
          onClose={() => setShowHistory(false)}
        />
      )}
    </>
  );
}
