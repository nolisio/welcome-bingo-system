import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import {
  AdminParticipantSummary,
  BonusRoundType,
  CustomQuestionRequestState,
  GameState,
  ParticipantState,
  RoundQuestionSource,
  RoundState,
  VoteChoice,
} from '../models/types';
import {
  closeCenterCell,
  checkBingo,
  generateBingoCard,
  getInitialOpenedCells,
  hasUnopenedCell,
  isCardWithinCurrentRange,
  MAX_DRAW_NUMBER,
  MIN_DRAW_NUMBER,
  normalizeLegacyCardNumbers,
  normalizeOpenedCells,
  openCell,
  openCellByIndex,
  openCenterCell,
} from '../lib/bingoCard';
import { getPrisma } from '../lib/prisma';

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
    customQuestionRequest: null,
  };
}

function addBingoWinner(participant: ParticipantState, round: RoundState): void {
  if (participant.hasBingo || !checkBingo(participant.card.openedCells)) {
    return;
  }

  participant.hasBingo = true;
  _game.bingoWinners.push(participant.id);
  round.newBingoWinners.push(participant.id);
}

function getRandomUnusedNumber(): number {
  const allNumbers = Array.from(
    { length: MAX_DRAW_NUMBER - MIN_DRAW_NUMBER + 1 },
    (_, index) => MIN_DRAW_NUMBER + index,
  );
  const unused = allNumbers.filter((value) => !_game.drawnNumbers.includes(value));
  if (unused.length === 0) {
    throw new Error('抽選できる番号がもうありません');
  }

  return unused[Math.floor(Math.random() * unused.length)];
}

function getEffectiveBonusRoundType(payload: StartRoundPayload): BonusRoundType {
  if (payload.bonusRoundType) {
    return payload.bonusRoundType;
  }
  return payload.isBonusRound ? 'MAJORITY' : 'NONE';
}

function getRoundResultChoice(round: RoundState): VoteChoice | null {
  if (round.bonusRoundType === 'QUIZ') {
    return round.correctChoice;
  }
  return round.majorityVote;
}

export function getGame(): GameState {
  return _game;
}

export function getCustomQuestionRequest(): CustomQuestionRequestState | null {
  return _game.customQuestionRequest;
}

function hasStartedRoundProgress(): boolean {
  return _game.currentRound !== null || _game.completedRounds.length > 0;
}

export function listParticipantSummaries(): AdminParticipantSummary[] {
  return Object.values(_game.participants)
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      isNewEmployee: participant.isNewEmployee,
      connected: participant.socketId !== null,
    }))
    .sort((left, right) => {
      if (left.isNewEmployee !== right.isNewEmployee) {
        return left.isNewEmployee ? -1 : 1;
      }
      return left.name.localeCompare(right.name, 'ja');
    });
}

export function requestCustomQuestion(
  participantId: string,
): CustomQuestionRequestState {
  const participant = _game.participants[participantId];
  if (!participant) {
    throw new Error('参加者が見つかりません');
  }
  if (!participant.isNewEmployee) {
    throw new Error('質問作成依頼を送れるのは新入社員のみです');
  }
  if (!participant.socketId) {
    throw new Error('選択した参加者は現在オフラインです');
  }
  if (_game.currentRound && _game.currentRound.status === 'VOTING') {
    throw new Error('投票中は質問作成依頼を出せません');
  }
  if (_game.currentRound?.pendingBonusSelectors.length) {
    throw new Error('ボーナスマスの選択が完了するまで質問作成依頼は出せません');
  }
  if (_game.customQuestionRequest) {
    throw new Error(
      `${_game.customQuestionRequest.participantName}さんがすでに質問を作成中です`,
    );
  }

  _game.customQuestionRequest = {
    participantId: participant.id,
    participantName: participant.name,
    requestedAt: new Date().toISOString(),
  };

  return _game.customQuestionRequest;
}

export function cancelCustomQuestionRequest(): void {
  _game.customQuestionRequest = null;
}

export function requireCustomQuestionRequestTarget(
  participantId: string,
): CustomQuestionRequestState {
  const activeRequest = _game.customQuestionRequest;
  if (!activeRequest) {
    throw new Error('現在有効な質問作成依頼がありません');
  }
  if (activeRequest.participantId !== participantId) {
    throw new Error(
      `現在は${activeRequest.participantName}さんが質問作成担当です`,
    );
  }

  return activeRequest;
}

export function resolveCustomQuestionRequest(participantId: string): void {
  if (_game.customQuestionRequest?.participantId === participantId) {
    _game.customQuestionRequest = null;
  }
}

export async function registerParticipant(
  name: string,
  sessionId: string,
  isNewEmployee: boolean,
): Promise<ParticipantState> {
  const existing = Object.values(_game.participants).find(
    (participant) => participant.sessionId === sessionId,
  );
  if (existing) {
    const prisma = getPrisma();
    if (existing.isNewEmployee !== isNewEmployee && hasStartedRoundProgress()) {
      throw new Error('ラウンド開始後は新入社員設定を変更できません');
    }

    const nextOpenedCells = isNewEmployee
      ? openCenterCell(existing.card.openedCells)
      : closeCenterCell(existing.card.openedCells);

    if (existing.name !== name || existing.isNewEmployee !== isNewEmployee) {
      const previousName = existing.name;
      const previousIsNewEmployee = existing.isNewEmployee;
      existing.name = name;
      existing.isNewEmployee = isNewEmployee;

      await prisma.participant
        .update({ where: { sessionId }, data: { name, isNewEmployee } })
        .catch((error: unknown) => {
          existing.name = previousName;
          existing.isNewEmployee = previousIsNewEmployee;
          console.error(
            `[registerParticipant] failed to update participant for sessionId=${sessionId}:`,
            error,
          );
        });
    }

    if (nextOpenedCells !== existing.card.openedCells) {
      const previousOpenedCells = existing.card.openedCells;
      existing.card.openedCells = nextOpenedCells;

      await prisma.bingoCard
        .updateMany({
          where: { participantId: existing.id },
          data: { openedCells: nextOpenedCells },
        })
        .catch((error: unknown) => {
          existing.card.openedCells = previousOpenedCells;
          console.error(
            `[registerParticipant] failed to update opened cells for sessionId=${sessionId}:`,
            error,
          );
        });
    }

    return existing;
  }

  const prisma = getPrisma();
  const dbParticipant = await prisma.participant.upsert({
    where: { sessionId },
    update: { name, isNewEmployee },
    create: { name, sessionId, isNewEmployee },
    select: { id: true, isNewEmployee: true },
  });
  const id = dbParticipant.id;

  const existingCard = await prisma.bingoCard.findUnique({
    where: { participantId: id },
  });

  let card: ParticipantState['card'];
  if (existingCard) {
    if (!isCardWithinCurrentRange(existingCard.numbers)) {
      // Cards from older draw ranges are regenerated once so they stay playable.
      const regeneratedNumbers = generateBingoCard();
      const regeneratedOpenedCells = getInitialOpenedCells(
        dbParticipant.isNewEmployee,
      );

      card = {
        numbers: regeneratedNumbers,
        openedCells: regeneratedOpenedCells,
      };

      await prisma.bingoCard.update({
        where: { participantId: id },
        data: {
          numbers: regeneratedNumbers,
          openedCells: regeneratedOpenedCells,
        },
      });
    } else {
      const hadLegacyFreeCenter = existingCard.numbers[12] === 0;
      const normalizedNumbers = normalizeLegacyCardNumbers(existingCard.numbers);
      const normalizedMask = normalizeOpenedCells(
        existingCard.openedCells,
        dbParticipant.isNewEmployee,
        hadLegacyFreeCenter,
      );

      card = {
        numbers: normalizedNumbers,
        openedCells: normalizedMask,
      };

      if (hadLegacyFreeCenter || normalizedMask !== existingCard.openedCells) {
        await prisma.bingoCard.update({
          where: { participantId: id },
          data: {
            numbers: normalizedNumbers,
            openedCells: normalizedMask,
          },
        });
      }
    }
  } else {
    card = {
      numbers: generateBingoCard(),
      openedCells: getInitialOpenedCells(dbParticipant.isNewEmployee),
    };
    await prisma.bingoCard.create({
      data: {
        participantId: id,
        numbers: card.numbers,
        openedCells: card.openedCells,
      },
    });
  }

  const participant: ParticipantState = {
    id,
    name,
    sessionId,
    isNewEmployee: dbParticipant.isNewEmployee,
    socketId: null,
    card,
    currentVote: null,
    hasBingo: false,
  };

  _game.participants[id] = participant;
  return participant;
}

export function setSocketId(
  sessionId: string,
  socketId: string,
): ParticipantState | null {
  const participant = Object.values(_game.participants).find(
    (current) => current.sessionId === sessionId,
  );
  if (!participant) return null;
  participant.socketId = socketId;
  return participant;
}

export function disconnectParticipant(socketId: string): void {
  const participant = Object.values(_game.participants).find(
    (current) => current.socketId === socketId,
  );
  if (participant) {
    participant.socketId = null;
  }
}

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
  await prisma.$transaction([
    prisma.vote.deleteMany(),
    prisma.customQuestion.deleteMany(),
    prisma.bingoCard.deleteMany(),
    prisma.round.deleteMany(),
    prisma.participant.deleteMany(),
    prisma.game.deleteMany(),
  ]);
  _game = createEmptyGame();
  await prisma.game.create({ data: { id: _game.id, status: 'WAITING' } });
}

export interface StartRoundPayload {
  question: string;
  optionA: string;
  optionB: string;
  questionImageUrl?: string | null;
  optionAImageUrl?: string | null;
  optionBImageUrl?: string | null;
  sourceType?: RoundQuestionSource;
  preparedQuestionId?: string | null;
  bonusRoundType?: BonusRoundType;
  correctChoice?: VoteChoice | null;
  isBonusRound?: boolean;
}

export async function startRound(payload: StartRoundPayload): Promise<RoundState> {
  if (_game.status !== 'ACTIVE') {
    throw new Error('ゲームが開始されていません');
  }
  if (_game.currentRound && _game.currentRound.status !== 'COMPLETED') {
    throw new Error('前のラウンドがまだ完了していません');
  }
  if (_game.currentRound?.pendingBonusSelectors.length) {
    throw new Error('ボーナスマスの選択がまだ完了していません');
  }
  if (_game.customQuestionRequest) {
    throw new Error(
      `${_game.customQuestionRequest.participantName}さんの質問作成がまだ完了していません`,
    );
  }

  const bonusRoundType = getEffectiveBonusRoundType(payload);
  const isBonusRound = bonusRoundType !== 'NONE';
  const correctChoice =
    bonusRoundType === 'QUIZ' ? payload.correctChoice ?? null : null;

  if (bonusRoundType === 'QUIZ' && correctChoice == null) {
    throw new Error('ボーナス問題では正解を指定してください');
  }

  const prisma = getPrisma();
  await prisma.game.upsert({
    where: { id: _game.id },
    update: {},
    create: { id: _game.id, status: 'ACTIVE' },
  });

  for (const participant of Object.values(_game.participants)) {
    participant.currentVote = null;
  }

  const drawnNumber = isBonusRound ? 0 : getRandomUnusedNumber();
  const roundNumber = _game.completedRounds.length + 1;
  const roundId = uuidv4();

  const round: RoundState = {
    id: roundId,
    roundNumber,
    drawnNumber,
    question: payload.question,
    optionA: payload.optionA,
    optionB: payload.optionB,
    questionImageUrl: payload.questionImageUrl ?? null,
    optionAImageUrl: payload.optionAImageUrl ?? null,
    optionBImageUrl: payload.optionBImageUrl ?? null,
    sourceType: payload.sourceType ?? 'MANUAL',
    preparedQuestionId: payload.preparedQuestionId ?? null,
    isBonusRound,
    bonusRoundType,
    correctChoice,
    status: 'VOTING',
    majorityVote: null,
    votes: {},
    cellOpeners: [],
    newBingoWinners: [],
    pendingBonusSelectors: [],
    bonusSelections: {},
  };

  const roundCreateInput: Prisma.RoundUncheckedCreateInput = {
    id: roundId,
    gameId: _game.id,
    roundNumber,
    drawnNumber,
    question: payload.question,
    optionA: payload.optionA,
    optionB: payload.optionB,
    questionImageUrl: payload.questionImageUrl ?? null,
    optionAImageUrl: payload.optionAImageUrl ?? null,
    optionBImageUrl: payload.optionBImageUrl ?? null,
    sourceType: payload.sourceType ?? 'MANUAL',
    preparedQuestionId: payload.preparedQuestionId ?? null,
    isBonusRound,
    bonusRoundType,
    correctChoice,
    status: 'VOTING',
  };

  await prisma.round.create({
    data: roundCreateInput,
  });

  if (!isBonusRound) {
    _game.drawnNumbers.push(drawnNumber);
  }
  _game.currentRound = round;

  return round;
}

export async function submitVote(
  participantId: string,
  choice: VoteChoice,
): Promise<void> {
  if (!_game.currentRound || _game.currentRound.status !== 'VOTING') {
    throw new Error('現在は投票を受け付けていません');
  }

  const participant = _game.participants[participantId];
  if (!participant) {
    throw new Error('参加者が見つかりません');
  }
  if (_game.currentRound.votes[participantId]) {
    throw new Error('すでに投票済みです');
  }

  _game.currentRound.votes[participantId] = choice;
  participant.currentVote = choice;

  const prisma = getPrisma();
  await prisma.vote.create({
    data: {
      roundId: _game.currentRound.id,
      participantId,
      choice,
    },
  });
}

export async function closeVoting(): Promise<RoundState> {
  if (!_game.currentRound || _game.currentRound.status !== 'VOTING') {
    throw new Error('現在進行中の投票ラウンドがありません');
  }

  const round = _game.currentRound;
  round.status = 'CLOSED';

  let countA = 0;
  let countB = 0;
  for (const choice of Object.values(round.votes)) {
    if (choice === 'A') {
      countA += 1;
    } else {
      countB += 1;
    }
  }

  const majorityVote: VoteChoice | null =
    countA > countB ? 'A' : countB > countA ? 'B' : null;
  round.majorityVote = majorityVote;

  const prisma = getPrisma();
  const resultChoice = getRoundResultChoice(round);

  if (round.bonusRoundType !== 'NONE') {
    round.pendingBonusSelectors = Object.values(_game.participants)
      .filter((participant) => {
        const voted = round.votes[participant.id];
        return (
          resultChoice !== null &&
          voted === resultChoice &&
          hasUnopenedCell(participant.card.openedCells)
        );
      })
      .map((participant) => participant.id);
  } else {
    for (const participant of Object.values(_game.participants)) {
      const voted = round.votes[participant.id];
      const isEligible = majorityVote !== null && voted === majorityVote;

      if (!isEligible) {
        continue;
      }

      const before = participant.card.openedCells;
      const after = openCell(
        participant.card.numbers,
        participant.card.openedCells,
        round.drawnNumber,
      );

      if (after !== before) {
        participant.card.openedCells = after;
        round.cellOpeners.push(participant.id);

        await prisma.bingoCard
          .updateMany({
            where: { participantId: participant.id },
            data: { openedCells: after },
          })
          .catch((error: unknown) => {
            console.error(
              `[closeVoting] failed to persist card for participant ${participant.id} in round ${round.id}:`,
              error,
            );
          });
      }

      addBingoWinner(participant, round);
    }
  }

  round.status = 'COMPLETED';
  _game.completedRounds.push(round);

  await prisma.round.update({
    where: { id: round.id },
    data: {
      status: 'COMPLETED',
      majorityVote,
    },
  });

  return round;
}

export async function selectBonusCell(
  participantId: string,
  cellIndex: number,
): Promise<RoundState> {
  const round = _game.currentRound;
  if (!round || round.status !== 'COMPLETED' || round.bonusRoundType === 'NONE') {
    throw new Error('現在選択できるボーナスマスはありません');
  }

  const participant = _game.participants[participantId];
  if (!participant) {
    throw new Error('参加者が見つかりません');
  }
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 24) {
    throw new Error('選択したマスが不正です');
  }
  if (!round.pendingBonusSelectors.includes(participantId)) {
    if (round.bonusSelections[participantId] != null) {
      throw new Error('ボーナスマスはすでに選択済みです');
    }
    throw new Error('あなたは今回ボーナスマスを選べません');
  }
  if ((participant.card.openedCells & (1 << cellIndex)) !== 0) {
    throw new Error('そのマスはすでに開いています');
  }

  const nextOpenedCells = openCellByIndex(participant.card.openedCells, cellIndex);
  const prisma = getPrisma();
  const updateResult = await prisma.bingoCard.updateMany({
    where: { participantId },
    data: { openedCells: nextOpenedCells },
  });
  if (updateResult.count !== 1) {
    throw new Error('ボーナスマスの更新に失敗しました');
  }

  participant.card.openedCells = nextOpenedCells;
  round.bonusSelections[participantId] = cellIndex;
  round.pendingBonusSelectors = round.pendingBonusSelectors.filter(
    (currentId) => currentId !== participantId,
  );
  if (!round.cellOpeners.includes(participantId)) {
    round.cellOpeners.push(participantId);
  }

  addBingoWinner(participant, round);

  return round;
}

export function getPublicGameState() {
  const { participants, currentRound, completedRounds, drawnNumbers, ...rest } = _game;
  const isVoting = currentRound?.status === 'VOTING';
  const publicDrawnNumbers = isVoting
    ? drawnNumbers.filter((value) => value !== currentRound?.drawnNumber)
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
          questionImageUrl: currentRound.questionImageUrl,
          optionAImageUrl: currentRound.optionAImageUrl,
          optionBImageUrl: currentRound.optionBImageUrl,
          sourceType: currentRound.sourceType,
          isBonusRound: isVoting ? false : currentRound.isBonusRound,
          bonusRoundType: isVoting ? 'NONE' : currentRound.bonusRoundType,
          correctChoice: isVoting ? null : currentRound.correctChoice,
          status: currentRound.status,
          majorityVote: currentRound.majorityVote,
          voteCount: Object.keys(currentRound.votes).length,
          cellOpeners: currentRound.cellOpeners,
          newBingoWinners: currentRound.newBingoWinners,
          bonusSelectionCount: Object.keys(currentRound.bonusSelections).length,
          pendingBonusSelectorCount: currentRound.pendingBonusSelectors.length,
        }
      : null,
    completedRounds: completedRounds.map((round) => ({
      id: round.id,
      roundNumber: round.roundNumber,
      drawnNumber: round.drawnNumber,
      question: round.question,
      optionA: round.optionA,
      optionB: round.optionB,
      questionImageUrl: round.questionImageUrl,
      optionAImageUrl: round.optionAImageUrl,
      optionBImageUrl: round.optionBImageUrl,
      sourceType: round.sourceType,
      isBonusRound: round.isBonusRound,
      bonusRoundType: round.bonusRoundType,
      correctChoice: round.correctChoice,
      majorityVote: round.majorityVote,
      voteCount: Object.keys(round.votes).length,
      bonusSelectionCount: Object.keys(round.bonusSelections).length,
      pendingBonusSelectorCount: round.pendingBonusSelectors.length,
    })),
  };
}

export function getParticipantView(participantId: string) {
  const participant = _game.participants[participantId];
  if (!participant) return null;

  const currentRound = _game.currentRound;
  const canChooseBonusCell =
    !!currentRound &&
    currentRound.bonusRoundType !== 'NONE' &&
    currentRound.status === 'COMPLETED' &&
    currentRound.pendingBonusSelectors.includes(participantId);

  return {
    id: participant.id,
    name: participant.name,
    isNewEmployee: participant.isNewEmployee,
    hasBingo: participant.hasBingo,
    card: participant.card,
    currentVote: participant.currentVote,
    canChooseBonusCell,
    drawnNumbers: [..._game.drawnNumbers],
    customQuestionRequest: _game.customQuestionRequest,
    currentRound: currentRound
      ? {
          id: currentRound.id,
          roundNumber: currentRound.roundNumber,
          drawnNumber: currentRound.drawnNumber,
          question: currentRound.question,
          optionA: currentRound.optionA,
          optionB: currentRound.optionB,
          questionImageUrl: currentRound.questionImageUrl,
          optionAImageUrl: currentRound.optionAImageUrl,
          optionBImageUrl: currentRound.optionBImageUrl,
          sourceType: currentRound.sourceType,
          isBonusRound:
            currentRound.status === 'VOTING' ? false : currentRound.isBonusRound,
          bonusRoundType:
            currentRound.status === 'VOTING' ? 'NONE' : currentRound.bonusRoundType,
          correctChoice:
            currentRound.status === 'VOTING' ? null : currentRound.correctChoice,
          status: currentRound.status,
          majorityVote: currentRound.majorityVote,
          voteCount: Object.keys(currentRound.votes).length,
          myVote: currentRound.votes[participantId] ?? null,
          cellOpeners: currentRound.cellOpeners,
          myBonusSelectionCellIndex:
            currentRound.bonusSelections[participantId] ?? null,
          bonusSelectionCount: Object.keys(currentRound.bonusSelections).length,
          pendingBonusSelectorCount: currentRound.pendingBonusSelectors.length,
        }
      : null,
  };
}
