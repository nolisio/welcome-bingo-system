CREATE TYPE "PreparedQuestionKind" AS ENUM ('MAJORITY', 'QUIZ');

ALTER TABLE "PreparedQuestion"
ADD COLUMN "slug" TEXT,
ADD COLUMN "kind" "PreparedQuestionKind" NOT NULL DEFAULT 'MAJORITY',
ADD COLUMN "correctChoice" TEXT;

UPDATE "PreparedQuestion"
SET "slug" = 'prepared-' || substring("id" from 1 for 8)
WHERE "slug" IS NULL;

ALTER TABLE "PreparedQuestion"
ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "PreparedQuestion_slug_key" ON "PreparedQuestion"("slug");
