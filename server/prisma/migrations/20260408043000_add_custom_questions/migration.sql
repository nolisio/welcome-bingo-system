CREATE TYPE "CustomQuestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "CustomQuestion" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "optionA" TEXT NOT NULL,
    "optionB" TEXT NOT NULL,
    "status" "CustomQuestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomQuestion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomQuestion"
ADD CONSTRAINT "CustomQuestion_participantId_fkey"
FOREIGN KEY ("participantId") REFERENCES "Participant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
