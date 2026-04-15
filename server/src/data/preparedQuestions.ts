import { PreparedQuestionKind, VoteChoice } from '../models/types';
import { PreparedQuestionPayload } from '../services/preparedQuestionService';

export interface PreparedQuestionSeed extends PreparedQuestionPayload {
  slug: string;
  kind: PreparedQuestionKind;
  correctChoice?: VoteChoice | null;
}

/**
 * 本番で使う事前登録問題の定義ファイルです。
 * 画像は client/public 配下のパスを `/question-assets/...` で指定します。
 */
export const preparedQuestionSeeds: PreparedQuestionSeed[] = [
  {
    slug: 'majority-homework-fast-or-late',
    kind: 'MAJORITY',
    question: '夏休みの宿題、どっち派？',
    optionA: '最初に終わらせる',
    optionB: '最後に追い込む',
  },
  {
    slug: 'majority-food-meat-or-fish',
    kind: 'MAJORITY',
    question: '今食べたいのは？',
    optionA: '肉',
    optionB: '魚',
    imageUrl: '/question-assets/majority/food/nanitabeyou.jpeg',
    optionAImageUrl: '/question-assets/majority/food/meet.png',
    optionBImageUrl: '/question-assets/majority/food/fish.png',
  },
  {
    slug: 'majority-meal-or-sleep',
    kind: 'MAJORITY',
    question: '大事なのはどっち？',
    optionA: '食事',
    optionB: '睡眠',
  },
  {
    slug: 'quiz-it-abbreviation',
    kind: 'QUIZ',
    question: 'ITは何の略？',
    optionA: 'Information Technology',
    optionB: 'Internet Technology',
    correctChoice: 'A',
  },
  {
    slug: 'quiz-ai-abbreviation',
    kind: 'QUIZ',
    question: 'AIって何の略？',
    optionA: 'Artificial Intelligence',
    optionB: 'Automatic Intelligence',
    correctChoice: 'A',
  },
];
