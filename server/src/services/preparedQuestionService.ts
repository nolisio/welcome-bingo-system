import { PreparedQuestionRecord } from '../models/types';
import { getPrisma } from '../lib/prisma';

interface PreparedQuestionPayload {
  question: string;
  optionA: string;
  optionB: string;
  imageUrl?: string | null;
  optionAImageUrl?: string | null;
  optionBImageUrl?: string | null;
}

function sanitizeField(value: string, label: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label}を入力してください`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${label}は${maxLength}文字以内で入力してください`);
  }
  return trimmed;
}

function sanitizeImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  if (trimmed.length > 500) {
    throw new Error('画像URLは500文字以内で入力してください');
  }
  return trimmed;
}

function toRecord(question: {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  imageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rounds: { gameId: string }[];
}, currentGameId: string): PreparedQuestionRecord {
  return {
    id: question.id,
    question: question.question,
    optionA: question.optionA,
    optionB: question.optionB,
    imageUrl: question.imageUrl,
    optionAImageUrl: question.optionAImageUrl,
    optionBImageUrl: question.optionBImageUrl,
    isActive: question.isActive,
    usedInCurrentGame: question.rounds.some((round) => round.gameId === currentGameId),
    totalUseCount: question.rounds.length,
    createdAt: question.createdAt.toISOString(),
    updatedAt: question.updatedAt.toISOString(),
  };
}

export async function createPreparedQuestion(
  payload: PreparedQuestionPayload,
  currentGameId: string,
): Promise<PreparedQuestionRecord> {
  const prisma = getPrisma();
  const created = await prisma.preparedQuestion.create({
    data: {
      question: sanitizeField(payload.question, '質問文', 120),
      optionA: sanitizeField(payload.optionA, '選択肢A', 40),
      optionB: sanitizeField(payload.optionB, '選択肢B', 40),
      imageUrl: sanitizeImageUrl(payload.imageUrl),
      optionAImageUrl: sanitizeImageUrl(payload.optionAImageUrl),
      optionBImageUrl: sanitizeImageUrl(payload.optionBImageUrl),
    },
    include: {
      rounds: {
        select: { gameId: true },
      },
    },
  });

  return toRecord(created, currentGameId);
}

export async function listPreparedQuestions(
  currentGameId: string,
): Promise<PreparedQuestionRecord[]> {
  const prisma = getPrisma();
  const questions = await prisma.preparedQuestion.findMany({
    include: {
      rounds: {
        select: { gameId: true },
      },
    },
    orderBy: [
      { isActive: 'desc' },
      { updatedAt: 'desc' },
    ],
  });

  return questions.map((question) => toRecord(question, currentGameId));
}

export async function setPreparedQuestionActive(
  id: string,
  isActive: boolean,
  currentGameId: string,
): Promise<PreparedQuestionRecord> {
  const prisma = getPrisma();
  const updated = await prisma.preparedQuestion.update({
    where: { id },
    data: { isActive },
    include: {
      rounds: {
        select: { gameId: true },
      },
    },
  });

  return toRecord(updated, currentGameId);
}

export async function getRandomUnusedPreparedQuestion(
  currentGameId: string,
): Promise<PreparedQuestionRecord> {
  const prisma = getPrisma();
  const usedRoundLinks = await prisma.round.findMany({
    where: {
      gameId: currentGameId,
      preparedQuestionId: { not: null },
    },
    select: { preparedQuestionId: true },
  });
  const usedIds = usedRoundLinks
    .map((round) => round.preparedQuestionId)
    .filter((value): value is string => !!value);

  const candidates = await prisma.preparedQuestion.findMany({
    where: {
      isActive: true,
      ...(usedIds.length > 0 ? { id: { notIn: usedIds } } : {}),
    },
    include: {
      rounds: {
        select: { gameId: true },
      },
    },
  });

  if (candidates.length === 0) {
    throw new Error('このゲームで使える未使用の質問プールがありません');
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  return toRecord(selected, currentGameId);
}
