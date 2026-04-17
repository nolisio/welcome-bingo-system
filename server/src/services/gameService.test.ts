import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { CENTER_CELL_INDEX } from '../lib/bingoCard';
import { setPrismaForTesting } from '../lib/prisma';
import {
  closeVoting,
  getGame,
  getParticipantView,
  registerParticipant,
  requestCustomQuestion,
  resetGame,
  selectBonusCell,
  setSocketId,
  startGame,
  startRound,
  submitVote,
} from './gameService';

type ParticipantRow = {
  id: string;
  name: string;
  sessionId: string;
  isNewEmployee: boolean;
};

type BingoCardRow = {
  id: string;
  participantId: string;
  numbers: number[];
  openedCells: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockPrismaClient = PrismaClient & {
  __controls: {
    failNextBingoCardUpdate: boolean;
    seedColdBootData: () => void;
  };
};

function createMockPrisma(): MockPrismaClient {
  const participantsById = new Map<string, ParticipantRow>();
  const participantsBySessionId = new Map<string, string>();
  const bingoCardsByParticipantId = new Map<string, BingoCardRow>();
  const gamesById = new Map<string, { id: string; status: string }>();
  const roundsById = new Map<string, Record<string, unknown>>();
  const votesById = new Map<string, Record<string, unknown>>();
  let customQuestionCount = 0;
  const controls = {
    failNextBingoCardUpdate: false,
    seedColdBootData: () => {
      const participant: ParticipantRow = {
        id: 'cold-boot-participant-1',
        name: '再起動テスト参加者',
        sessionId: 'cold-boot-session-1',
        isNewEmployee: false,
      };
      participantsById.set(participant.id, participant);
      participantsBySessionId.set(participant.sessionId, participant.id);
      bingoCardsByParticipantId.set(participant.id, {
        id: 'cold-boot-card-1',
        participantId: participant.id,
        numbers: Array.from({ length: 25 }, (_, index) => index + 1),
        openedCells: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      roundsById.set('cold-boot-round-1', {
        id: 'cold-boot-round-1',
        gameId: 'cold-boot-game-1',
        roundNumber: 1,
        status: 'COMPLETED',
      });
    },
  };

  const prisma = {
    participant: {
      async count() {
        return participantsById.size;
      },
      async upsert({
        where,
        update,
        create,
        select,
      }: {
        where: { sessionId: string };
        update: { name: string; isNewEmployee: boolean };
        create: { name: string; sessionId: string; isNewEmployee: boolean };
        select?: { id?: boolean; isNewEmployee?: boolean };
      }) {
        const existingId = participantsBySessionId.get(where.sessionId);
        let row = existingId ? participantsById.get(existingId) ?? null : null;

        if (!row) {
          row = {
            id: `participant-${participantsById.size + 1}`,
            name: create.name,
            sessionId: create.sessionId,
            isNewEmployee: create.isNewEmployee,
          };
          participantsById.set(row.id, row);
          participantsBySessionId.set(row.sessionId, row.id);
        } else {
          row.name = update.name;
          row.isNewEmployee = update.isNewEmployee;
        }

        if (!select) {
          return row;
        }

        return {
          ...(select.id ? { id: row.id } : {}),
          ...(select.isNewEmployee ? { isNewEmployee: row.isNewEmployee } : {}),
        };
      },
      async update({
        where,
        data,
      }: {
        where: { sessionId: string };
        data: { name?: string; isNewEmployee?: boolean };
      }) {
        const participantId = participantsBySessionId.get(where.sessionId);
        if (!participantId) {
          throw new Error('participant not found');
        }

        const row = participantsById.get(participantId)!;
        Object.assign(row, data);
        return row;
      },
      async deleteMany() {
        const count = participantsById.size;
        participantsById.clear();
        participantsBySessionId.clear();
        return { count };
      },
    },
    bingoCard: {
      async count() {
        return bingoCardsByParticipantId.size;
      },
      async findUnique({ where }: { where: { participantId: string } }) {
        return bingoCardsByParticipantId.get(where.participantId) ?? null;
      },
      async create({
        data,
      }: {
        data: { participantId: string; numbers: number[]; openedCells: number };
      }) {
        const row: BingoCardRow = {
          id: `card-${bingoCardsByParticipantId.size + 1}`,
          participantId: data.participantId,
          numbers: [...data.numbers],
          openedCells: data.openedCells,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        bingoCardsByParticipantId.set(row.participantId, row);
        return row;
      },
      async update({
        where,
        data,
      }: {
        where: { participantId: string };
        data: { numbers?: number[]; openedCells?: number };
      }) {
        if (controls.failNextBingoCardUpdate) {
          controls.failNextBingoCardUpdate = false;
          throw new Error('mocked bingo card persistence failure');
        }

        const row = bingoCardsByParticipantId.get(where.participantId);
        if (!row) {
          throw new Error('bingo card not found');
        }

        if (data.numbers) row.numbers = [...data.numbers];
        if (typeof data.openedCells === 'number') row.openedCells = data.openedCells;
        row.updatedAt = new Date();
        return row;
      },
      async updateMany({
        where,
        data,
      }: {
        where: { participantId: string };
        data: { openedCells: number };
      }) {
        if (controls.failNextBingoCardUpdate) {
          controls.failNextBingoCardUpdate = false;
          throw new Error('mocked bingo card persistence failure');
        }

        const row = bingoCardsByParticipantId.get(where.participantId);
        if (!row) {
          return { count: 0 };
        }

        row.openedCells = data.openedCells;
        row.updatedAt = new Date();
        return { count: 1 };
      },
      async deleteMany() {
        const count = bingoCardsByParticipantId.size;
        bingoCardsByParticipantId.clear();
        return { count };
      },
    },
    game: {
      async upsert({
        where,
        update,
        create,
      }: {
        where: { id: string };
        update: { status?: string };
        create: { id: string; status: string };
      }) {
        const existing = gamesById.get(where.id);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }

        const row = { id: create.id, status: create.status };
        gamesById.set(row.id, row);
        return row;
      },
      async create({ data }: { data: { id: string; status: string } }) {
        const row = { id: data.id, status: data.status };
        gamesById.set(row.id, row);
        return row;
      },
      async deleteMany() {
        const count = gamesById.size;
        gamesById.clear();
        return { count };
      },
    },
    round: {
      async count() {
        return roundsById.size;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        roundsById.set(String(data.id), { ...data });
        return data;
      },
      async update({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) {
        const row = roundsById.get(where.id);
        if (!row) {
          throw new Error('round not found');
        }

        Object.assign(row, data);
        return row;
      },
      async deleteMany() {
        const count = roundsById.size;
        roundsById.clear();
        return { count };
      },
    },
    vote: {
      async count() {
        return votesById.size;
      },
      async create({ data }: { data: Record<string, unknown> }) {
        const row = { id: `vote-${votesById.size + 1}`, ...data };
        votesById.set(String(row.id), row);
        return row;
      },
      async deleteMany() {
        const count = votesById.size;
        votesById.clear();
        return { count };
      },
    },
    customQuestion: {
      async deleteMany() {
        const count = customQuestionCount;
        customQuestionCount = 0;
        return { count };
      },
    },
    async $transaction(promises: Promise<unknown>[]) {
      return Promise.all(promises);
    },
  };

  return {
    ...(prisma as unknown as PrismaClient),
    __controls: controls,
  } as MockPrismaClient;
}

let mockPrisma: MockPrismaClient;

beforeEach(async () => {
  mockPrisma = createMockPrisma();
  setPrismaForTesting(mockPrisma);
  await resetGame();
});

after(() => {
  setPrismaForTesting(null);
});

function isCenterOpen(openedCells: number): boolean {
  return (openedCells & (1 << CENTER_CELL_INDEX)) !== 0;
}

function findSelectableCellIndex(openedCells: number): number {
  const selectable = Array.from({ length: 25 }, (_, index) => index).find(
    (index) => (openedCells & (1 << index)) === 0,
  );

  if (selectable == null) {
    throw new Error('selectable cell not found');
  }

  return selectable;
}

test('新入社員フラグを開始前に戻すと中央マス優遇も取り消される', async () => {
  const firstJoin = await registerParticipant('山田', 'session-yamada', true);
  assert.equal(isCenterOpen(firstJoin.card.openedCells), true);

  const correctedJoin = await registerParticipant('山田', 'session-yamada', false);
  assert.equal(correctedJoin.isNewEmployee, false);
  assert.equal(isCenterOpen(correctedJoin.card.openedCells), false);
});

test('再起動でDBに残骸がある場合はゲーム開始前にリセットを要求する', async () => {
  mockPrisma.__controls.seedColdBootData();

  await assert.rejects(
    () => startGame(),
    /最初に「ゲームをリセット」を実行してください/,
  );
  assert.equal(getGame().status, 'WAITING');
});

test('ボーナスマス選択が残っている間は質問作成依頼を開始できない', async () => {
  const participant = await registerParticipant('佐藤', 'session-sato', true);
  setSocketId('session-sato', 'socket-sato');

  await startGame();
  await startRound({
    question: 'ボーナスタイムの確認',
    optionA: 'A',
    optionB: 'B',
    bonusRoundType: 'MAJORITY',
  });
  await submitVote(participant.id, 'A');
  await closeVoting();

  assert.throws(
    () => requestCustomQuestion(participant.id),
    /ボーナスマスの選択が完了するまで質問作成依頼は出せません/,
  );
});

test('通常ラウンドからボーナス問題、質問依頼まで一連の進行を完了できる', async () => {
  const newEmployee = await registerParticipant('高橋', 'session-takahashi', true);
  const existingEmployee = await registerParticipant('鈴木', 'session-suzuki', false);

  setSocketId('session-takahashi', 'socket-takahashi');
  setSocketId('session-suzuki', 'socket-suzuki');

  await startGame();

  const normalRound = await startRound({
    question: '夏休みの宿題、どっち派？',
    optionA: '最初に終わらせる',
    optionB: '最後に追い込む',
  });
  assert.equal(normalRound.status, 'VOTING');

  await submitVote(newEmployee.id, 'A');
  await submitVote(existingEmployee.id, 'A');
  const completedNormalRound = await closeVoting();
  assert.equal(completedNormalRound.status, 'COMPLETED');
  assert.equal(completedNormalRound.majorityVote, 'A');

  const quizRound = await startRound({
    question: 'ITは何の略？',
    optionA: 'Information Technology',
    optionB: 'Internet Technology',
    bonusRoundType: 'QUIZ',
    correctChoice: 'A',
  });
  assert.equal(quizRound.bonusRoundType, 'QUIZ');

  await submitVote(newEmployee.id, 'A');
  await submitVote(existingEmployee.id, 'B');
  const completedQuizRound = await closeVoting();
  assert.deepEqual(completedQuizRound.pendingBonusSelectors, [newEmployee.id]);

  const beforeBonusSelection = getParticipantView(newEmployee.id);
  assert.ok(beforeBonusSelection);
  assert.equal(beforeBonusSelection.canChooseBonusCell, true);

  const selectableCellIndex = findSelectableCellIndex(beforeBonusSelection.card.openedCells);
  const selectedRound = await selectBonusCell(newEmployee.id, selectableCellIndex);
  assert.equal(selectedRound.pendingBonusSelectors.length, 0);

  const afterBonusSelection = getParticipantView(newEmployee.id);
  assert.ok(afterBonusSelection);
  assert.equal(afterBonusSelection.canChooseBonusCell, false);
  assert.equal(afterBonusSelection.currentRound?.myBonusSelectionCellIndex, selectableCellIndex);

  const request = requestCustomQuestion(newEmployee.id);
  assert.equal(request.participantId, newEmployee.id);
  assert.equal(request.participantName, newEmployee.name);
});

test('ボーナスマスの永続化に失敗した場合は in-memory 状態を更新しない', async () => {
  const participant = await registerParticipant('伊藤', 'session-ito', true);
  setSocketId('session-ito', 'socket-ito');

  await startGame();
  await startRound({
    question: 'ボーナスタイムの永続化確認',
    optionA: 'A',
    optionB: 'B',
    bonusRoundType: 'MAJORITY',
  });
  await submitVote(participant.id, 'A');
  await closeVoting();

  const beforeSelection = getParticipantView(participant.id);
  assert.ok(beforeSelection);
  const selectableCellIndex = findSelectableCellIndex(beforeSelection.card.openedCells);

  mockPrisma.__controls.failNextBingoCardUpdate = true;

  await assert.rejects(
    () => selectBonusCell(participant.id, selectableCellIndex),
    /mocked bingo card persistence failure/,
  );

  const afterFailure = getParticipantView(participant.id);
  assert.ok(afterFailure);
  assert.equal(afterFailure.currentRound?.pendingBonusSelectorCount, 1);
  assert.equal(afterFailure.currentRound?.myBonusSelectionCellIndex, null);
  assert.equal(
    afterFailure.card.openedCells,
    beforeSelection.card.openedCells,
  );
});
