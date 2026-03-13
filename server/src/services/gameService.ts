import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  ParticipantState,
  RoundState,
  VoteChoice,
} from '../models/types';
import {
  generateBingoCard,
  INITIAL_OPENED_CELLS,
  openCell,
  checkBingo,
} from '../lib/bingoCard';
import { getPrisma } from '../lib/prisma';

/** Singleton in-memory game state */
let _game: GameState = createEmptyGame();

function createEmptyGame(): GameState {
  return {
    id: uuidv4(),
    status: 'WAITING',
    drawnNumbers: [],
    currentRound: null,
    completedRounds: [],
    participants: {},
    bingoWinners: [],
  };
}

export function getGame(): GameState {
  return _game;
}

// ---------------------------------------------------------------------------
// Participants
// ---------------------------------------------------------------------------

export async function registerParticipant(
  name: string,
  sessionId: string,
): Promise<ParticipantState> {
  // Fast path: participant already in memory from this server run
  const existing = Object.values(_game.participants).find(
    (p) => p.sessionId === sessionId,
  );
  if (existing) return existing;

  // Resolve the canonical DB id *before* registering in memory so the id
  // never changes once the participant can interact with the game.
  const prisma = getPrisma();
  const dbParticipant = await prisma.participant.upsert({
    where: { sessionId },
    update: { name },
    create: { name, sessionId },
    select: { id: true },
  });
  const id = dbParticipant.id;

  // Load existing card from DB, or generate a fresh one
  const existingCard = await prisma.bingoCard.findUnique({
    where: { participantId: id },
  });

  let card: ParticipantState['card'];
  if (existingCard) {
    card = { numbers: existingCard.numbers, openedCells: existingCard.openedCells };
  } else {
    card = { numbers: generateBingoCard(), openedCells: INITIAL_OPENED_CELLS };
    await prisma.bingoCard
      .create({ data: { participantId: id, numbers: card.numbers, openedCells: card.openedCells } });
  }

  const participant: ParticipantState = {
    id,
    name,
    sessionId,
    socketId: null,
    card,
    currentVote: null,
    hasBingo: false,
  };

  _game.participants[id] = participant;
  return participant;
}

export function setSocketId(sessionId: string, socketId: string): ParticipantState | null {
  const p = Object.values(_game.participants).find((p) => p.sessionId === sessionId);
  if (!p) return null;
  p.socketId = socketId;
  return p;
}

export function disconnectParticipant(socketId: string): void {
  const p = Object.values(_game.participants).find((p) => p.socketId === socketId);
  if (p) p.socketId = null;
}

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

export async function startGame(): Promise<void> {
  if (_game.status === 'ACTIVE') return;
  _game.status = 'ACTIVE';

  const prisma = getPrisma();
  await prisma.game.upsert({
    where: { id: _game.id },
    update: { status: 'ACTIVE' },
    create: { id: _game.id, status: 'ACTIVE' },
  });
}

export async function resetGame(): Promise<void> {
  const prisma = getPrisma();
  // Clear all persisted state in FK-safe order before resetting memory so
  // participants can rejoin with a clean slate (no sessionId conflicts).
  await prisma.$transaction([
    prisma.vote.deleteMany(),
    prisma.bingoCard.deleteMany(),
    prisma.round.deleteMany(),
    prisma.participant.deleteMany(),
    prisma.game.deleteMany(),
  ]);
  _game = createEmptyGame();
  await prisma.game.create({ data: { id: _game.id, status: 'WAITING' } });
}

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------

export interface StartRoundPayload {
  question: string;
  optionA: string;
  optionB: string;
}

/** Draw a random number not yet used and start a new round */
export async function startRound(payload: StartRoundPayload): Promise<RoundState> {
  if (_game.status !== 'ACTIVE') {
    throw new Error('Game is not active');
  }
  if (_game.currentRound && _game.currentRound.status !== 'COMPLETED') {
    throw new Error('Previous round is not completed');
  }

  // Ensure game is in DB
  const prisma = getPrisma();
  await prisma.game.upsert({
    where: { id: _game.id },
    update: {},
    create: { id: _game.id, status: 'ACTIVE' },
  });

  // Draw a random unused number from 1-75
  const allNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
  const unused = allNumbers.filter((n) => !_game.drawnNumbers.includes(n));
  if (unused.length === 0) {
    throw new Error('All numbers have been drawn – game over');
  }

  const drawnNumber = unused[Math.floor(Math.random() * unused.length)];
  _game.drawnNumbers.push(drawnNumber);

  // Reset participant votes for the new round
  for (const p of Object.values(_game.participants)) {
    p.currentVote = null;
  }

  const roundNumber = _game.completedRounds.length + 1;
  const roundId = uuidv4();

  const round: RoundState = {
    id: roundId,
    roundNumber,
    drawnNumber,
    question: payload.question,
    optionA: payload.optionA,
    optionB: payload.optionB,
    status: 'VOTING',
    majorityVote: null,
    votes: {},
    cellOpeners: [],
    newBingoWinners: [],
  };

  _game.currentRound = round;

  // Persist round
  await prisma.round.create({
    data: {
      id: roundId,
      gameId: _game.id,
      roundNumber,
      drawnNumber,
      question: payload.question,
      optionA: payload.optionA,
      optionB: payload.optionB,
      status: 'VOTING',
    },
  });

  return round;
}

/** Submit a participant's vote */
export async function submitVote(
  participantId: string,
  choice: VoteChoice,
): Promise<void> {
  if (!_game.currentRound || _game.currentRound.status !== 'VOTING') {
    throw new Error('Voting is not open');
  }

  const participant = _game.participants[participantId];
  if (!participant) throw new Error('Participant not found');

  // Only allow one vote per round
  if (_game.currentRound.votes[participantId]) {
    throw new Error('Already voted');
  }

  _game.currentRound.votes[participantId] = choice;
  participant.currentVote = choice;

  // Persist vote
  const prisma = getPrisma();
  await prisma.vote.create({
    data: {
      roundId: _game.currentRound.id,
      participantId,
      choice,
    },
  });
}

/** Close voting, compute majority, open cells, check bingo */
export async function closeVoting(): Promise<RoundState> {
  if (!_game.currentRound || _game.currentRound.status !== 'VOTING') {
    throw new Error('No active voting round');
  }

  const round = _game.currentRound;
  round.status = 'CLOSED';

  // Count votes
  let countA = 0;
  let countB = 0;
  for (const choice of Object.values(round.votes)) {
    if (choice === 'A') countA++;
    else countB++;
  }

  const majority: VoteChoice | null =
    countA > countB ? 'A' : countB > countA ? 'B' : null;
  round.majorityVote = majority;

  // Open cells for eligible participants

  for (const participant of Object.values(_game.participants)) {
    const voted = round.votes[participant.id];
    const isEligible = majority !== null && voted === majority;

    if (isEligible) {
      const before = participant.card.openedCells;
      const after = openCell(
        participant.card.numbers,
        participant.card.openedCells,
        round.drawnNumber,
      );

      if (after !== before) {
        participant.card.openedCells = after;
        round.cellOpeners.push(participant.id);

        // Persist card update
        const prisma = getPrisma();
        await prisma.bingoCard
          .updateMany({
            where: { participantId: participant.id },
            data: { openedCells: after },
          })
          .catch(console.error);
      }

      // Check bingo
      if (!participant.hasBingo && checkBingo(participant.card.openedCells)) {
        participant.hasBingo = true;
        _game.bingoWinners.push(participant.id);
        round.newBingoWinners.push(participant.id);
      }
    }
  }

  round.status = 'COMPLETED';
  _game.completedRounds.push(round);
  // Keep currentRound set to the completed round so socket handlers can
  // broadcast drawnNumber / majorityVote / cellOpeners to clients immediately
  // after closeVoting() resolves.  It is overwritten by the next startRound().

  // Persist round final state
  const prisma = getPrisma();
  await prisma.round.update({
    where: { id: round.id },
    data: {
      status: 'COMPLETED',
      majorityVote: majority,
    },
  });

  return round;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public view helpers
// ---------------------------------------------------------------------------

/** Sanitised game state safe to broadcast to all clients */
export function getPublicGameState() {
  const { participants, currentRound, completedRounds, drawnNumbers, ...rest } = _game;

  // Redact the drawn number from the public payload while voting is still open
  // so neither the projector nor any observer can learn the number early.
  const isVoting = currentRound?.status === 'VOTING';
  const publicDrawnNumbers = isVoting
    ? drawnNumbers.filter((n) => n !== currentRound?.drawnNumber)
    : drawnNumbers;

  return {
    ...rest,
    drawnNumbers: publicDrawnNumbers,
    participantCount: Object.keys(participants).length,
    currentRound: currentRound
      ? {
          id: currentRound.id,
          roundNumber: currentRound.roundNumber,
          drawnNumber: isVoting ? null : currentRound.drawnNumber,
          question: currentRound.question,
          optionA: currentRound.optionA,
          optionB: currentRound.optionB,
          status: currentRound.status,
          majorityVote: currentRound.majorityVote,
          voteCount: Object.keys(currentRound.votes).length,
          cellOpeners: currentRound.cellOpeners,
          newBingoWinners: currentRound.newBingoWinners,
        }
      : null,
    completedRounds: completedRounds.map((r) => ({
      id: r.id,
      roundNumber: r.roundNumber,
      drawnNumber: r.drawnNumber,
      question: r.question,
      optionA: r.optionA,
      optionB: r.optionB,
      majorityVote: r.majorityVote,
      voteCount: Object.keys(r.votes).length,
    })),
  };
}

/** Participant-specific state (includes their card) */
export function getParticipantView(participantId: string) {
  const p = _game.participants[participantId];
  if (!p) return null;

  const cr = _game.currentRound;
  return {
    id: p.id,
    name: p.name,
    hasBingo: p.hasBingo,
    card: p.card,
    currentVote: p.currentVote,
    currentRound: cr
      ? {
          id: cr.id,
          roundNumber: cr.roundNumber,
          drawnNumber: cr.status !== 'VOTING' ? cr.drawnNumber : null,
          question: cr.question,
          optionA: cr.optionA,
          optionB: cr.optionB,
          status: cr.status,
          majorityVote: cr.majorityVote,
          voteCount: Object.keys(cr.votes).length,
          myVote: cr.votes[participantId] ?? null,
          cellOpeners: cr.cellOpeners,
        }
      : null,
  };
}
