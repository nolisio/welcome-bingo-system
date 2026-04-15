export type VoteChoice = 'A' | 'B';
export type GameStatus = 'WAITING' | 'ACTIVE' | 'FINISHED';
export type RoundStatus = 'VOTING' | 'CLOSED' | 'COMPLETED';
export type CustomQuestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type RoundQuestionSource = 'MANUAL' | 'POOL';
export type BonusRoundType = 'NONE' | 'MAJORITY' | 'QUIZ';
export type PreparedQuestionKind = 'MAJORITY' | 'QUIZ';

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
  questionImageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  sourceType: RoundQuestionSource;
  isBonusRound: boolean;
  bonusRoundType: BonusRoundType;
  correctChoice: VoteChoice | null;
  status: RoundStatus;
  majorityVote: VoteChoice | null;
  voteCount: number;
  cellOpeners: string[];
  newBingoWinners: string[];
  bonusSelectionCount: number;
  pendingBonusSelectorCount: number;
}

export interface CompletedRound {
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
  isBonusRound: boolean;
  bonusRoundType: BonusRoundType;
  correctChoice: VoteChoice | null;
  majorityVote: VoteChoice | null;
  voteCount: number;
  bonusSelectionCount: number;
  pendingBonusSelectorCount: number;
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
  questionImageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  sourceType: RoundQuestionSource;
  isBonusRound: boolean;
  bonusRoundType: BonusRoundType;
  correctChoice: VoteChoice | null;
  status: RoundStatus;
  majorityVote: VoteChoice | null;
  voteCount: number;
  myVote: VoteChoice | null;
  cellOpeners: string[];
  myBonusSelectionCellIndex: number | null;
  bonusSelectionCount: number;
  pendingBonusSelectorCount: number;
}

export interface CustomQuestionRequestInfo {
  participantId: string;
  participantName: string;
  requestedAt: string;
}

export interface ParticipantState {
  id: string;
  name: string;
  isNewEmployee: boolean;
  hasBingo: boolean;
  card: BingoCardState;
  currentVote: VoteChoice | null;
  canChooseBonusCell: boolean;
  currentRound: ParticipantRound | null;
  customQuestionRequest: CustomQuestionRequestInfo | null;
}

export interface BingoWinner {
  id: string;
  name: string;
}

export interface CustomQuestionReview {
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

export interface AdminParticipantSummary {
  id: string;
  name: string;
  isNewEmployee: boolean;
  connected: boolean;
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
