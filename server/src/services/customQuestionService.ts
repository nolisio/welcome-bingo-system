import {
  CustomQuestionRecord,
  CustomQuestionStatus,
} from '../models/types';
import { getPrisma } from '../lib/prisma';

interface SubmitCustomQuestionPayload {
  question: string;
  optionA: string;
  optionB: string;
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

function toRecord(question: {
  id: string;
  participantId: string;
  question: string;
  optionA: string;
  optionB: string;
  status: CustomQuestionStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  participant: { name: string };
}): CustomQuestionRecord {
  return {
    id: question.id,
    participantId: question.participantId,
    participantName: question.participant.name,
    question: question.question,
    optionA: question.optionA,
    optionB: question.optionB,
    status: question.status,
    reviewedBy: question.reviewedBy,
    reviewedAt: question.reviewedAt?.toISOString() ?? null,
    createdAt: question.createdAt.toISOString(),
  };
}

export async function submitCustomQuestion(
  participantId: string,
  payload: SubmitCustomQuestionPayload,
): Promise<CustomQuestionRecord> {
  const prisma = getPrisma();
  const participant = await prisma.participant.findUnique({
    where: { id: participantId },
    select: { id: true, isNewEmployee: true, name: true },
  });

  if (!participant) {
    throw new Error('参加者が見つかりません');
  }
  if (!participant.isNewEmployee) {
    throw new Error('質問案を投稿できるのは新入社員のみです');
  }

  const question = sanitizeField(payload.question, '質問文', 120);
  const optionA = sanitizeField(payload.optionA, '選択肢A', 40);
  const optionB = sanitizeField(payload.optionB, '選択肢B', 40);

  const created = await prisma.customQuestion.create({
    data: {
      participantId,
      question,
      optionA,
      optionB,
    },
    include: {
      participant: {
        select: { name: true },
      },
    },
  });

  return toRecord(created);
}

export async function listCustomQuestions(
  statuses: CustomQuestionStatus[] = ['PENDING', 'APPROVED'],
): Promise<CustomQuestionRecord[]> {
  const prisma = getPrisma();
  const questions = await prisma.customQuestion.findMany({
    where: { status: { in: statuses } },
    include: {
      participant: {
        select: { name: true },
      },
    },
    orderBy: [
      { createdAt: 'desc' },
    ],
  });

  return questions.map(toRecord);
}

export async function reviewCustomQuestion(
  questionId: string,
  nextStatus: Extract<CustomQuestionStatus, 'APPROVED' | 'REJECTED'>,
  reviewedBy: string,
): Promise<CustomQuestionRecord> {
  const prisma = getPrisma();
  const current = await prisma.customQuestion.findUnique({
    where: { id: questionId },
    include: {
      participant: {
        select: { name: true },
      },
    },
  });

  if (!current) {
    throw new Error('質問案が見つかりません');
  }
  if (current.status !== 'PENDING') {
    throw new Error('この質問案はすでに確認済みです');
  }

  const updated = await prisma.customQuestion.update({
    where: { id: questionId },
    data: {
      status: nextStatus,
      reviewedBy,
      reviewedAt: new Date(),
    },
    include: {
      participant: {
        select: { name: true },
      },
    },
  });

  return toRecord(updated);
}
