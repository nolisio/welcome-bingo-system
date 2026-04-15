import 'dotenv/config';
import { preparedQuestionSeeds } from '../data/preparedQuestions';
import { getGame } from '../services/gameService';
import { syncPreparedQuestions } from '../services/preparedQuestionService';
import { getPrisma } from '../lib/prisma';

async function main(): Promise<void> {
  const result = await syncPreparedQuestions(preparedQuestionSeeds, getGame().id);

  console.log(
    `[prepared-question-sync] created=${result.createdCount} updated=${result.updatedCount} total=${result.questions.length}`,
  );

  for (const question of result.questions) {
    console.log(
      ` - [${question.kind}] ${question.slug} :: ${question.question}`,
    );
  }
}

main()
  .catch((error) => {
    console.error('[prepared-question-sync] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPrisma().$disconnect();
  });
