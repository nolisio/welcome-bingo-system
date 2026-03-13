/**
 * In-memory domain models for the bingo game server.
 * These represent runtime state; history is persisted in PostgreSQL.
 */

export type VoteChoice = 'A' | 'B';

export interface ParticipantState {
  id: string;
  name: string;
  sessionId: string;
  socketId: string | null;
  card: BingoCardState;
  /** Whether participant has submitted a vote in the current round */
  currentVote: VoteChoice | null;
  hasBingo: boolean;
}

export interface BingoCardState {
  /** Row-major 5×5 array of numbers */
  numbers: number[];
  /** 25-bit bitmask: bit i set → cell i is opened */
  openedCells: number;
}

export type GameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED';
export type RoundStatus = 'VOTING' | 'CLOSED' | 'COMPLETED';

export interface RoundState {
  id: string;
  roundNumber: number;
  drawnNumber: number;
  question: string;
  optionA: string;
  optionB: string;
  status: RoundStatus;
  majorityVote: VoteChoice | null;
  /** participantId → VoteChoice */
  votes: Record<string, VoteChoice>;
  /** participantIds who opened this round's cell */
  cellOpeners: string[];
  /** participantIds who got bingo this round */
  newBingoWinners: string[];
}

export interface GameState {
  id: string;
  status: GameStatus;
  /** Numbers already drawn across all rounds */
  drawnNumbers: number[];
  currentRound: RoundState | null;
  completedRounds: RoundState[];
  participants: Record<string, ParticipantState>;
  bingoWinners: string[];
}
