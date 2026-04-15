import { PreparedQuestionKind, PreparedQuestionRecord, VoteChoice } from '../models/types';
import { getPrisma } from '../lib/prisma';

export interface PreparedQuestionPayload {
  slug?: string;
  kind?: PreparedQuestionKind;
  question: string;
  optionA: string;
  optionB: string;
  imageUrl?: string | null;
  optionAImageUrl?: string | null;
  optionBImageUrl?: string | null;
  correctChoice?: VoteChoice | null;
  isActive?: boolean;
}

interface SyncPreparedQuestionsResult {
  createdCount: number;
  updatedCount: number;
  questions: PreparedQuestionRecord[];
}

const MAX_CREATE_RETRIES = 5;

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

function sanitizeKind(kind: PreparedQuestionKind | undefined): PreparedQuestionKind {
  return kind ?? 'MAJORITY';
}

function sanitizeCorrectChoice(
  kind: PreparedQuestionKind,
  value: VoteChoice | null | undefined,
): VoteChoice | null {
  if (kind === 'QUIZ') {
    if (value !== 'A' && value !== 'B') {
      throw new Error('クイズ問題では正解をAまたはBで指定してください');
    }
    return value;
  }

  return null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeSlug(value: string | undefined, fallbackQuestion: string): string {
  const base = value?.trim() || slugify(fallbackQuestion);
  if (!base) {
    return `prepared-${Date.now()}`;
  }
  if (base.length > 80) {
    throw new Error('問題コードは80文字以内で指定してください');
  }
  return base;
}

function getNextSlugRetryBase(baseSlug: string, currentSlug: string): string {
  if (currentSlug === baseSlug) {
    return `${baseSlug}-2`;
  }

  const escapedBase = baseSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = currentSlug.match(new RegExp(`^${escapedBase}-(\\d+)$`));

  if (!match) {
    return `${baseSlug}-2`;
  }

  return `${baseSlug}-${Number(match[1]) + 1}`;
}

function isSlugUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  if (!('code' in error) || error.code !== 'P2002') {
    return false;
  }

  const meta = 'meta' in error ? error.meta : undefined;
  const target =
    meta && typeof meta === 'object' && 'target' in meta ? meta.target : undefined;
  return Array.isArray(target) && target.includes('slug');
}

async function reservePreparedQuestionSlug(baseSlug: string): Promise<string> {
  const prisma = getPrisma();
  const existing = await prisma.preparedQuestion.findMany({
    where: {
      slug: {
        startsWith: baseSlug,
      },
    },
    select: { slug: true },
  });

  const used = new Set(existing.map((item) => item.slug));
  if (!used.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (used.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

function normalizePreparedQuestionPayload(
  payload: PreparedQuestionPayload,
): Required<
  Pick<
    PreparedQuestionPayload,
    'question' | 'optionA' | 'optionB' | 'kind' | 'correctChoice' | 'isActive'
  >
> & {
  slug: string;
  imageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
} {
  const question = sanitizeField(payload.question, '質問文', 120);
  const kind = sanitizeKind(payload.kind);

  return {
    slug: sanitizeSlug(payload.slug, question),
    kind,
    question,
    optionA: sanitizeField(payload.optionA, '選択肢A', 40),
    optionB: sanitizeField(payload.optionB, '選択肢B', 40),
    imageUrl: sanitizeImageUrl(payload.imageUrl),
    optionAImageUrl: sanitizeImageUrl(payload.optionAImageUrl),
    optionBImageUrl: sanitizeImageUrl(payload.optionBImageUrl),
    correctChoice: sanitizeCorrectChoice(kind, payload.correctChoice),
    isActive: payload.isActive ?? true,
  };
}

function toRecord(question: {
  id: string;
  slug: string;
  kind: PreparedQuestionKind;
  question: string;
  optionA: string;
  optionB: string;
  imageUrl: string | null;
  optionAImageUrl: string | null;
  optionBImageUrl: string | null;
  correctChoice: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  rounds: { gameId: string }[];
}, currentGameId?: string): PreparedQuestionRecord {
  return {
    id: question.id,
    slug: question.slug,
    kind: question.kind,
    question: question.question,
    optionA: question.optionA,
    optionB: question.optionB,
    imageUrl: question.imageUrl,
    optionAImageUrl: question.optionAImageUrl,
    optionBImageUrl: question.optionBImageUrl,
    correctChoice:
      question.correctChoice === 'A' || question.correctChoice === 'B'
        ? question.correctChoice
        : null,
    isActive: question.isActive,
    usedInCurrentGame: currentGameId
      ? question.rounds.some((round) => round.gameId === currentGameId)
      : false,
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
  const normalized = normalizePreparedQuestionPayload(payload);

  let candidateSlug = await reservePreparedQuestionSlug(normalized.slug);

  for (let attempt = 0; attempt < MAX_CREATE_RETRIES; attempt += 1) {
    try {
      const created = await prisma.preparedQuestion.create({
        data: {
          slug: candidateSlug,
          kind: normalized.kind,
          question: normalized.question,
          optionA: normalized.optionA,
          optionB: normalized.optionB,
          imageUrl: normalized.imageUrl,
          optionAImageUrl: normalized.optionAImageUrl,
          optionBImageUrl: normalized.optionBImageUrl,
          correctChoice: normalized.correctChoice,
          isActive: normalized.isActive,
        },
        include: {
          rounds: {
            select: { gameId: true },
          },
        },
      });

      return toRecord(created, currentGameId);
    } catch (error) {
      if (!isSlugUniqueConstraintError(error) || attempt === MAX_CREATE_RETRIES - 1) {
        throw error;
      }

      candidateSlug = await reservePreparedQuestionSlug(
        getNextSlugRetryBase(normalized.slug, candidateSlug),
      );
    }
  }

  throw new Error('質問プールの登録に失敗しました');
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
      { kind: 'asc' },
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
  kind: PreparedQuestionKind = 'MAJORITY',
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
      kind,
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
    const kindLabel = kind === 'QUIZ' ? 'クイズ問題' : '多数派質問';
    throw new Error(`このゲームで使える未使用の${kindLabel}プールがありません`);
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  return toRecord(selected, currentGameId);
}

export async function syncPreparedQuestions(
  payloads: PreparedQuestionPayload[],
  currentGameId?: string,
): Promise<SyncPreparedQuestionsResult> {
  const prisma = getPrisma();
  const questions: PreparedQuestionRecord[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const payload of payloads) {
    const normalized = normalizePreparedQuestionPayload(payload);
    const existing = await prisma.preparedQuestion.findUnique({
      where: { slug: normalized.slug },
      select: { id: true },
    });

    const question = await prisma.preparedQuestion.upsert({
      where: { slug: normalized.slug },
      update: {
        kind: normalized.kind,
        question: normalized.question,
        optionA: normalized.optionA,
        optionB: normalized.optionB,
        imageUrl: normalized.imageUrl,
        optionAImageUrl: normalized.optionAImageUrl,
        optionBImageUrl: normalized.optionBImageUrl,
        correctChoice: normalized.correctChoice,
        isActive: normalized.isActive,
      },
      create: {
        slug: normalized.slug,
        kind: normalized.kind,
        question: normalized.question,
        optionA: normalized.optionA,
        optionB: normalized.optionB,
        imageUrl: normalized.imageUrl,
        optionAImageUrl: normalized.optionAImageUrl,
        optionBImageUrl: normalized.optionBImageUrl,
        correctChoice: normalized.correctChoice,
        isActive: normalized.isActive,
      },
      include: {
        rounds: {
          select: { gameId: true },
        },
      },
    });

    if (existing) {
      updatedCount += 1;
    } else {
      createdCount += 1;
    }

    questions.push(toRecord(question, currentGameId));
  }

  return {
    createdCount,
    updatedCount,
    questions,
  };
}
