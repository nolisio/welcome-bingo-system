export type VoteChoice = 'A' | 'B';
export type GameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED';
export type RoundStatus = 'VOTING' | 'CLOSED' | 'COMPLETED';

export interface BingoCardState {
  numbers: number[];
  openedCells: number; // 25-bit bitmask
}

export interface PublicRound {
  id: string;
  roundNumber: number;
  drawnNumber: number | null; // null while status === 'VOTING' (redacted server-side)
  question: string;
  optionA: string;
  optionB: string;
  status: RoundStatus;
  majorityVote: VoteChoice | null;
  voteCount: number;
  cellOpeners: string[];
  newBingoWinners: string[];
}

export interface CompletedRound {
  id: string;
  roundNumber: number;
  drawnNumber: number;
  question: string;
  optionA: string;
  optionB: string;
  majorityVote: VoteChoice | null;
  voteCount: number;
}

export interface PublicGameState {
  id: string;
  status: GameStatus;
  drawnNumbers: number[];
  participantCount: number;
  currentRound: PublicRound | null;
  completedRounds: CompletedRound[];
  bingoWinners: string[];
}

export interface ParticipantRound {
  id: string;
  roundNumber: number;
  drawnNumber: number | null;
  question: string;
  optionA: string;
  optionB: string;
  status: RoundStatus;
  majorityVote: VoteChoice | null;
  voteCount: number;
  myVote: VoteChoice | null;
  cellOpeners: string[];
}

export interface ParticipantState {
  id: string;
  name: string;
  hasBingo: boolean;
  card: BingoCardState;
  currentVote: VoteChoice | null;
  currentRound: ParticipantRound | null;
}

export interface BingoWinner {
  id: string;
  name: string;
}
