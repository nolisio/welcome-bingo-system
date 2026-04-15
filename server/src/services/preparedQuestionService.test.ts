import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import type { PrismaClient } from '@prisma/client';
import { setPrismaForTesting } from '../lib/prisma';
import {
  createPreparedQuestion,
  syncPreparedQuestions,
} from './preparedQuestionService';

type PreparedQuestionRow = {
  id: string;
  slug: string;
  kind: 'MAJORITY' | 'QUIZ';
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
};

type MockPrismaClient = PrismaClient & {
  __controls: {
    failSlugOnce: string | null;
  };
  __state: {
    createdSlugs: string[];
  };
};

function createMockPrisma(): MockPrismaClient {
  const preparedQuestions = new Map<string, PreparedQuestionRow>();
  const controls = {
    failSlugOnce: null as string | null,
  };
  const state = {
    createdSlugs: [] as string[],
  };

  const prisma = {
    preparedQuestion: {
      async findMany(args?: {
        where?: { slug?: { startsWith?: string } };
        select?: { slug?: boolean };
      }) {
        const rows = Array.from(preparedQuestions.values()).filter((row) => {
          const startsWith = args?.where?.slug?.startsWith;
          return startsWith ? row.slug.startsWith(startsWith) : true;
        });

        if (args?.select?.slug) {
          return rows.map((row) => ({ slug: row.slug }));
        }

        return rows;
      },
      async findUnique(args: {
        where: { slug: string };
        select?: { id?: boolean };
      }) {
        const row = preparedQuestions.get(args.where.slug) ?? null;
        if (!row) return null;
        if (args.select?.id) {
          return { id: row.id };
        }
        return row;
      },
      async create(args: {
        data: Omit<PreparedQuestionRow, 'id' | 'createdAt' | 'updatedAt' | 'rounds'>;
        include?: { rounds?: { select: { gameId: true } } };
      }) {
        if (controls.failSlugOnce === args.data.slug) {
          controls.failSlugOnce = null;
          throw {
            code: 'P2002',
            meta: { target: ['slug'] },
          };
        }

        if (preparedQuestions.has(args.data.slug)) {
          throw {
            code: 'P2002',
            meta: { target: ['slug'] },
          };
        }

        const row: PreparedQuestionRow = {
          id: `prepared-${preparedQuestions.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          rounds: [],
          ...args.data,
        };

        preparedQuestions.set(row.slug, row);
        state.createdSlugs.push(row.slug);
        return row;
      },
      async upsert(args: {
        where: { slug: string };
        update: Partial<PreparedQuestionRow>;
        create: Omit<PreparedQuestionRow, 'id' | 'createdAt' | 'updatedAt' | 'rounds'>;
      }) {
        const existing = preparedQuestions.get(args.where.slug);
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: new Date() });
          return existing;
        }

        const row: PreparedQuestionRow = {
          id: `prepared-${preparedQuestions.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          rounds: [],
          ...args.create,
        };
        preparedQuestions.set(row.slug, row);
        return row;
      },
    },
  };

  return {
    ...(prisma as unknown as PrismaClient),
    __controls: controls,
    __state: state,
  } as MockPrismaClient;
}

let mockPrisma: MockPrismaClient;

beforeEach(() => {
  mockPrisma = createMockPrisma();
  setPrismaForTesting(mockPrisma);
});

after(() => {
  setPrismaForTesting(null);
});

test('prepared question creation retries with a suffixed slug after a unique conflict', async () => {
  mockPrisma.__controls.failSlugOnce = 'duplicate-slug';

  const created = await createPreparedQuestion(
    {
      slug: 'duplicate-slug',
      question: '今食べたいのは？',
      optionA: '肉',
      optionB: '魚',
    },
    'game-1',
  );

  assert.equal(created.slug, 'duplicate-slug-2');
  assert.deepEqual(mockPrisma.__state.createdSlugs, ['duplicate-slug-2']);
});

test('syncPreparedQuestions can run without a current game id', async () => {
  const result = await syncPreparedQuestions(
    [
      {
        slug: 'quiz-it-abbreviation',
        kind: 'QUIZ',
        question: 'ITは何の略？',
        optionA: 'Information Technology',
        optionB: 'Internet Technology',
        correctChoice: 'A',
      },
    ],
    undefined,
  );

  assert.equal(result.questions.length, 1);
  assert.equal(result.questions[0].slug, 'quiz-it-abbreviation');
  assert.equal(result.questions[0].usedInCurrentGame, false);
});
