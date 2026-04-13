CREATE TYPE "RoundQuestionSource" AS ENUM ('MANUAL', 'POOL');

CREATE TABLE "PreparedQuestion" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "optionA" TEXT NOT NULL,
    "optionB" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreparedQuestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Round"
ADD COLUMN "questionImageUrl" TEXT,
ADD COLUMN "sourceType" "RoundQuestionSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "preparedQuestionId" TEXT;

ALTER TABLE "Round"
ADD CONSTRAINT "Round_preparedQuestionId_fkey"
FOREIGN KEY ("preparedQuestionId") REFERENCES "PreparedQuestion"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
