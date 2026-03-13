'use client';

import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { ParticipantState, VoteChoice, BingoWinner } from '@/types/game';
import BingoCard from '@/components/bingo/BingoCard';
import VotePanel from '@/components/game/VotePanel';

const SESSION_KEY = 'bingo_session';

function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function ParticipantPage() {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<ParticipantState | null>(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [bingoAnnouncement, setBingoAnnouncement] = useState<string | null>(null);


  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      // Auto-reconnect if session exists
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

    const onConnect = () => {
      setConnected(true);
      // Auto-reconnect if session exists
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
      setTimeout(() => setBingoAnnouncement(null), 8000);
    };

    const onGameReset = () => {
      // Clear participant session state so the user can re-join after a reset
      setJoined(false);
      setState(null);
      setBingoAnnouncement(null);
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
    };
  }, []);

  const handleJoin = () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
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
          setError(res?.error || 'Failed to join');
        }
      },
    );
  };

  const handleVote = (choice: VoteChoice) => {
    const socket = getSocket();
    socket.emit('vote:submit', { choice }, (res: any) => {
      if (!res?.ok) setError(res?.error || 'Vote failed');
    });
  };

  // Join screen
  if (!joined) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 p-6">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm">
          <h1 className="text-3xl font-extrabold text-center text-blue-700 mb-2">🎱 Welcome Bingo</h1>
          <p className="text-center text-gray-500 mb-8 text-sm">Enter your name to join the game</p>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            placeholder="Your name"
            className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 mb-4"
            maxLength={40}
          />
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button
            onClick={handleJoin}
            disabled={!connected}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl text-lg transition-colors"
          >
            {connected ? 'Join Game' : 'Connecting…'}
          </button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 animate-pulse">Loading your card…</p>
      </main>
    );
  }

  const round = state.currentRound;
  const isVoting = round?.status === 'VOTING';
  const isCompleted = round?.status === 'COMPLETED';
  const myCardHasDrawn =
    round?.drawnNumber != null &&
    state.card.numbers.includes(round.drawnNumber);
  const iCellOpener =
    round?.cellOpeners.includes(state.id) ?? false;

  return (
    <main className="flex flex-col items-center min-h-screen bg-gradient-to-br from-blue-50 to-white p-4 pb-8">
      {/* Bingo announcement banner */}
      {bingoAnnouncement && (
        <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
          <div className="bg-yellow-400 text-yellow-900 text-2xl font-extrabold px-10 py-6 rounded-3xl shadow-2xl animate-bounce">
            {bingoAnnouncement}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="w-full max-w-sm mt-4 mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-extrabold text-xl text-blue-700">Hey, {state.name}! 👋</h2>
          <p className="text-xs text-gray-400">{connected ? '🟢 Connected' : '🔴 Disconnected'}</p>
        </div>
        {state.hasBingo && (
          <span className="bg-yellow-400 text-yellow-900 font-extrabold px-3 py-1 rounded-full text-sm">
            🎉 BINGO!
          </span>
        )}
      </div>

      {/* Bingo Card */}
      <div className="mb-6">
        <BingoCard
          card={state.card}
          highlightNumber={round?.drawnNumber ?? undefined}
          size="md"
        />
      </div>

      {/* Round info */}
      {round ? (
        <div className="w-full max-w-sm space-y-4">
          {/* Round header */}
          <div className="bg-white rounded-2xl shadow p-4 text-center">
            <p className="text-xs text-gray-400 uppercase tracking-wider">Round {round.roundNumber}</p>
            <p className="text-sm font-medium text-gray-600 mt-1">
              {isVoting
                ? `🗳️ Voting open · ${round.voteCount} votes cast`
                : isCompleted
                ? `✅ Round complete · Majority: ${round.majorityVote ?? 'Tie'}`
                : '🔒 Voting closed'}
            </p>
            {round.drawnNumber != null && (
              <p className="mt-2 text-3xl font-extrabold text-blue-600">
                #{round.drawnNumber}
                {myCardHasDrawn && (
                  <span className="ml-2 text-sm bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                    on your card!
                  </span>
                )}
              </p>
            )}
            {isCompleted && iCellOpener && (
              <p className="mt-2 text-green-600 font-bold text-sm">
                🟢 You opened this cell!
              </p>
            )}
          </div>

          {/* Vote panel */}
          {isVoting && (
            <VotePanel
              question={round.question}
              optionA={round.optionA}
              optionB={round.optionB}
              myVote={state.currentVote}
              disabled={!!state.currentVote}
              onVote={handleVote}
            />
          )}

          {/* Results after voting */}
          {!isVoting && round.majorityVote && (
            <div className="bg-white rounded-2xl shadow p-4 text-center">
              <p className="text-gray-500 text-sm">{round.question}</p>
              <p className="mt-2 text-lg font-bold text-blue-700">
                Majority voted{' '}
                <span className="text-2xl">
                  {round.majorityVote === 'A' ? round.optionA : round.optionB}
                </span>{' '}
                ({round.majorityVote})
              </p>
              {state.currentVote && (
                <p className={`mt-1 text-sm ${state.currentVote === round.majorityVote ? 'text-green-600' : 'text-red-400'}`}>
                  You voted {state.currentVote === 'A' ? round.optionA : round.optionB}
                  {state.currentVote === round.majorityVote ? ' ✓ Correct side!' : ' ✗ Wrong side'}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 text-center text-gray-400">
          Waiting for the next round…
        </div>
      )}

      {error && (
        <p className="mt-4 text-red-500 text-sm">{error}</p>
      )}
    </main>
  );
}
