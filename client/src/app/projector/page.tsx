'use client';

import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { PublicGameState, BingoWinner } from '@/types/game';
import clsx from 'clsx';

const BINGO_LETTERS = ['B', 'I', 'N', 'G', 'O'];

export default function ProjectorPage() {
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [connected, setConnected] = useState(false);
  const [bingoEvent, setBingoEvent] = useState<{ winners: BingoWinner[]; message: string } | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      socket.emit('public:subscribe');
    };
    const onDisconnect = () => setConnected(false);
    const onGameState = (data: PublicGameState) => setGameState(data);
    const onBingoWinner = (data: { winners: BingoWinner[]; message: string }) => {
      setBingoEvent(data);
      setTimeout(() => setBingoEvent(null), 10000);
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

  const cr = gameState?.currentRound;
  const isVoting = cr?.status === 'VOTING';
  const isClosed = cr?.status === 'CLOSED' || cr?.status === 'COMPLETED';

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Bingo celebration overlay */}
      {bingoEvent && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-black/70">
          <div className="text-center animate-bounce">
            <p className="text-8xl mb-4">🎉</p>
            <p className="text-5xl font-extrabold text-yellow-400 mb-4">BINGO!</p>
            <div className="space-y-2">
              {bingoEvent.winners.map((w) => (
                <p key={w.id} className="text-3xl font-bold text-white">&#x1F3C6; {w.name}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Connection indicator */}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        <span className={clsx('w-2 h-2 rounded-full', connected ? 'bg-green-400' : 'bg-red-500')} />
        <span className="text-xs text-gray-400">{connected ? 'Live' : 'Offline'}</span>
      </div>

      {/* Logo / Title */}
      <h1 className="text-5xl font-extrabold text-blue-400 mb-2 tracking-tight">🎱 Welcome Bingo</h1>
      <p className="text-gray-400 text-sm mb-10">
        {gameState?.participantCount ?? 0} players · Round {gameState?.completedRounds.length ?? 0} of 75
      </p>

      {/* BINGO header board */}
      <div className="flex gap-3 mb-8">
        {BINGO_LETTERS.map((l) => (
          <div
            key={l}
            className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-3xl font-extrabold"
          >
            {l}
          </div>
        ))}
      </div>

      {/* Current round / drawn number */}
      {gameState?.status === 'WAITING' && (
        <div className="text-center text-gray-400 text-2xl animate-pulse">
          Waiting for game to start…
        </div>
      )}

      {gameState?.status === 'ACTIVE' && !cr && (
        <div className="text-center text-gray-400 text-2xl animate-pulse">
          Waiting for next round…
        </div>
      )}

      {cr && (
        <div className="w-full max-w-2xl space-y-6">
          {/* Drawn number – big display */}
          <div className="text-center">
            <p className="text-gray-400 text-sm uppercase tracking-widest mb-2">
              Round {cr.roundNumber}
            </p>
            {!isVoting && (
              <div className="text-9xl font-extrabold text-yellow-400 leading-none drop-shadow-2xl">
                {cr.drawnNumber}
              </div>
            )}
            {isVoting && (
              <div className="text-4xl font-bold text-gray-500 animate-pulse">
                🎲 Drawing in progress…
              </div>
            )}
          </div>

          {/* Question & options */}
          <div className="bg-gray-800 rounded-3xl p-8 text-center shadow-2xl">
            <p className="text-2xl font-semibold text-gray-100 mb-6">{cr.question}</p>
            <div className="flex gap-6 justify-center">
              {(['A', 'B'] as const).map((choice) => {
                const label = choice === 'A' ? cr.optionA : cr.optionB;
                const isMajority = !isVoting && cr.majorityVote === choice;
                return (
                  <div
                    key={choice}
                    className={clsx(
                      'flex-1 max-w-xs rounded-2xl p-6 transition-all duration-500',
                      isMajority
                        ? 'bg-green-600 scale-105 shadow-lg'
                        : isVoting
                        ? 'bg-gray-700'
                        : 'bg-gray-700 opacity-60',
                    )}
                  >
                    <p className="text-5xl font-extrabold mb-2">{choice}</p>
                    <p className="text-xl font-medium text-gray-100">{label}</p>
                    {isMajority && (
                      <p className="mt-3 text-green-200 font-bold text-sm uppercase tracking-wider">
                        ✓ Majority
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vote count */}
            <div className="mt-6 flex justify-center gap-6 text-sm text-gray-400">
              <span>
                🗳️ Votes: <strong className="text-white">{cr.voteCount}</strong>
                {' / '}
                {gameState?.participantCount}
              </span>
              <span>
                Status:{' '}
                <strong className={clsx(isVoting ? 'text-yellow-400' : 'text-green-400')}>
                  {cr.status}
                </strong>
              </span>
            </div>

            {/* Tie notice */}
            {isClosed && cr.majorityVote === null && (
              <p className="mt-4 text-orange-400 font-bold text-lg">🤝 It&apos;s a tie – no cells opened</p>
            )}
          </div>
        </div>
      )}

      {/* Drawn numbers history strip */}
      {gameState && gameState.drawnNumbers.length > 0 && (
        <div className="mt-10 w-full max-w-2xl">
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-3 text-center">
            Numbers drawn so far
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {gameState.drawnNumbers.map((n, i) => (
              <span
                key={n}
                className={clsx(
                  'w-10 h-10 flex items-center justify-center rounded-full text-sm font-bold',
                  i === gameState.drawnNumbers.length - 1
                    ? 'bg-yellow-400 text-gray-900 ring-4 ring-yellow-300'
                    : 'bg-blue-700 text-white',
                )}
              >
                {n}
              </span>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
