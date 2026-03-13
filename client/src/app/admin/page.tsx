'use client';

import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { PublicGameState, BingoWinner } from '@/types/game';
import clsx from 'clsx';

const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

export default function AdminPage() {
  const [secret, setSecret] = useState('');
  const [authed, setAuthed] = useState(false);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [question, setQuestion] = useState('');
  const [optionA, setOptionA] = useState('');
  const [optionB, setOptionB] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [winners, setWinners] = useState<BingoWinner[]>([]);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit('public:subscribe');
    };
    const onDisconnect = () => setConnected(false);
    const onGameState = (data: PublicGameState) => setGameState(data);
    const onBingoWinner = (data: { winners: BingoWinner[] }) => {
      setWinners((prev) => {
        const newOnes = data.winners.filter((w) => !prev.some((p) => p.id === w.id));
        return [...prev, ...newOnes];
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('game:state', onGameState);
    socket.on('bingo:winner', onBingoWinner);

    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('game:state', onGameState);
      socket.off('bingo:winner', onBingoWinner);
    };
  }, []);

  const emit = (event: string, data: object, cb?: (res: any) => void) => {
    const socket = getSocket();
    setLoading(true);
    socket.emit(event, { ...data, secret }, (res: any) => {
      setLoading(false);
      if (res?.ok) {
        setFeedback('✅ Done');
      } else {
        setFeedback(`❌ ${res?.error ?? 'Unknown error'}`);
      }
      if (cb) cb(res);
      setTimeout(() => setFeedback(''), 3000);
    });
  };

  const handleStartGame = () => emit('admin:start-game', {});
  const handleResetGame = () => {
    if (confirm('Reset the entire game? All progress will be lost.')) {
      emit('admin:reset-game', {});
      setWinners([]);
    }
  };
  const handleStartRound = () => {
    if (!question.trim() || !optionA.trim() || !optionB.trim()) {
      setFeedback('❌ Fill in question and both options');
      return;
    }
    emit('admin:start-round', { question, optionA, optionB }, (res) => {
      if (res?.ok) {
        setQuestion('');
        setOptionA('');
        setOptionB('');
      }
    });
  };
  const handleCloseVoting = () => emit('admin:close-voting', {});

  if (!authed) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
          <h1 className="text-2xl font-extrabold text-center text-gray-800 mb-6">🔐 Admin Login</h1>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setAuthed(true)}
            placeholder="Admin secret"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg mb-4 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={() => setAuthed(true)}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl"
          >
            Enter
          </button>
        </div>
      </main>
    );
  }

  const cr = gameState?.currentRound;
  const isVoting = cr?.status === 'VOTING';
  const hasActiveGame = gameState?.status === 'ACTIVE';
  const noActiveRound = !cr || cr.status === 'COMPLETED';

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-extrabold">🎱 Bingo Admin</h1>
          <div className="flex items-center gap-3">
            <span className={clsx('text-xs px-2 py-1 rounded-full', connected ? 'bg-green-800 text-green-300' : 'bg-red-800 text-red-300')}>
              {connected ? '● Live' : '○ Offline'}
            </span>
            <span className="text-xs bg-gray-700 px-2 py-1 rounded-full">
              👥 {gameState?.participantCount ?? 0} players
            </span>
          </div>
        </div>

        {feedback && (
          <div className="bg-gray-800 rounded-xl px-4 py-2 text-sm text-center">{feedback}</div>
        )}

        {/* Game controls */}
        <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-gray-300 text-sm uppercase tracking-wider">Game</h2>
          <div className="flex gap-3">
            <button
              onClick={handleStartGame}
              disabled={loading || hasActiveGame}
              className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-2 rounded-xl"
            >
              Start Game
            </button>
            <button
              onClick={handleResetGame}
              disabled={loading}
              className="flex-1 bg-red-700 hover:bg-red-800 disabled:bg-gray-600 text-white font-bold py-2 rounded-xl"
            >
              Reset Game
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Status: <strong className="text-white">{gameState?.status ?? '—'}</strong>
            {' · '}Rounds completed: <strong className="text-white">{gameState?.completedRounds.length ?? 0}</strong>
          </p>
        </div>

        {/* Drawn numbers board */}
        <div className="bg-gray-800 rounded-2xl p-5">
          <h2 className="font-bold text-gray-300 text-sm uppercase tracking-wider mb-3">Drawn Numbers</h2>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 75 }, (_, i) => i + 1).map((n) => {
              const drawn = gameState?.drawnNumbers.includes(n);
              const isLast = gameState?.drawnNumbers[gameState.drawnNumbers.length - 1] === n;
              return (
                <span
                  key={n}
                  className={clsx(
                    'w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold',
                    drawn
                      ? isLast
                        ? 'bg-yellow-400 text-gray-900'
                        : 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-400',
                  )}
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>

        {/* Start new round */}
        <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
          <h2 className="font-bold text-gray-300 text-sm uppercase tracking-wider">New Round</h2>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Question (e.g. Cats or Dogs?)"
            className="w-full bg-gray-700 text-white rounded-xl px-4 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-3">
            <input
              type="text"
              value={optionA}
              onChange={(e) => setOptionA(e.target.value)}
              placeholder="Option A"
              className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={optionB}
              onChange={(e) => setOptionB(e.target.value)}
              placeholder="Option B"
              className="flex-1 bg-gray-700 text-white rounded-xl px-4 py-2 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleStartRound}
            disabled={loading || !hasActiveGame || !noActiveRound}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 rounded-xl"
          >
            Draw Number &amp; Start Round
          </button>
        </div>

        {/* Current round controls */}
        {cr && cr.status !== 'COMPLETED' && (
          <div className="bg-gray-800 rounded-2xl p-5 space-y-3">
            <h2 className="font-bold text-gray-300 text-sm uppercase tracking-wider">
              Round {cr.roundNumber} · #{cr.drawnNumber}
            </h2>
            <p className="text-sm text-gray-300">{cr.question}</p>
            <div className="flex gap-4 text-sm text-gray-400">
              <span>A: {cr.optionA}</span>
              <span>B: {cr.optionB}</span>
            </div>
            <p className="text-sm">
              Votes cast: <strong>{cr.voteCount}</strong>
              {' / '}
              {gameState?.participantCount}
              <span className="ml-2 text-xs text-gray-400">({cr.status})</span>
            </p>
            <button
              onClick={handleCloseVoting}
              disabled={loading || !isVoting}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 text-white font-bold py-2 rounded-xl"
            >
              Close Voting &amp; Reveal Results
            </button>
          </div>
        )}

        {/* Last completed round */}
        {gameState && gameState.completedRounds.length > 0 && (() => {
          const last = gameState.completedRounds[gameState.completedRounds.length - 1];
          return (
            <div className="bg-gray-800 rounded-2xl p-5">
              <h2 className="font-bold text-gray-300 text-sm uppercase tracking-wider mb-2">
                Last Round Result
              </h2>
              <p className="text-sm text-gray-300">{last.question}</p>
              <p className="text-sm mt-1">
                Majority: <strong className="text-yellow-400">{last.majorityVote ?? 'Tie'}</strong>
                {' · '}Drawn: <strong className="text-blue-400">#{last.drawnNumber}</strong>
                {' · '}{last.voteCount} votes
              </p>
            </div>
          );
        })()}

        {/* Bingo winners */}
        {winners.length > 0 && (
          <div className="bg-yellow-900 rounded-2xl p-5">
            <h2 className="font-bold text-yellow-300 text-sm uppercase tracking-wider mb-2">🎉 Bingo Winners</h2>
            <ul className="space-y-1">
              {winners.map((w) => (
                <li key={w.id} className="text-yellow-100 text-sm">🏆 {w.name}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Completed rounds log */}
        {gameState && gameState.completedRounds.length > 0 && (
          <div className="bg-gray-800 rounded-2xl p-5">
            <h2 className="font-bold text-gray-300 text-sm uppercase tracking-wider mb-3">Round History</h2>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[...gameState.completedRounds].reverse().map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs text-gray-400 bg-gray-700 rounded-lg px-3 py-2">
                  <span>#{r.drawnNumber} · R{r.roundNumber}</span>
                  <span className="truncate max-w-[140px] text-gray-300">{r.question}</span>
                  <span className="font-bold text-white">{r.majorityVote ?? 'Tie'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
