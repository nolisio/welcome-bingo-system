/**
 * In-memory domain models for the bingo game server.
 * These represent runtime state; history is persisted in PostgreSQL.
 */

export type VoteChoice = 'A' | 'B';
export type CustomQuestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RoundQuestionSource = 'MANUAL' | 'POOL';
export type BonusRoundType = 'NONE' | 'MAJORITY' | 'QUIZ';
export type PreparedQuestionKind = 'MAJORITY' | 'QUIZ';

export interface ParticipantState {
  id: string;
  name: string;
  sessionId: string;
  isNewEmployee: boolean;
  socketId: string | null;
  card: BingoCardState;
  /** Whether participant has submitted a vote in the current round */
  currentVote: VoteChoice | null;
  hasBingo: boolean;
}

export interface CustomQuestionRequestState {
  participantId: string;
  participantName: string;
  requestedAt: string;
}

export interface AdminParticipantSummary {
  id: string;
  name: string;
  isNewEmployee: boolean;
  connected: boolean;
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
  questionImageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  sourceType: RoundQuestionSource;
  preparedQuestionId: string | null;
  isBonusRound: boolean;
  bonusRoundType: BonusRoundType;
  correctChoice: VoteChoice | null;
  status: RoundStatus;
  majorityVote: VoteChoice | null;
  /** participantId → VoteChoice */
  votes: Record<string, VoteChoice>;
  /** participantIds who opened this round's cell */
  cellOpeners: string[];
  /** participantIds who got bingo this round */
  newBingoWinners: string[];
  /** participantIds who can still choose a bonus cell */
  pendingBonusSelectors: string[];
  /** participantId -> selected cell index */
  bonusSelections: Record<string, number>;
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
  customQuestionRequest: CustomQuestionRequestState | null;
}

export interface CustomQuestionRecord {
  id: string;
  participantId: string;
  participantName: string;
  question: string;
  optionA: string;
  optionB: string;
  status: CustomQuestionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PreparedQuestionRecord {
  id: string;
  slug: string;
  kind: PreparedQuestionKind;
  question: string;
  optionA: string;
  optionB: string;
  imageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  correctChoice: VoteChoice | null;
  isActive: boolean;
  usedInCurrentGame: boolean;
  totalUseCount: number;
  createdAt: string;
  updatedAt: string;
}
