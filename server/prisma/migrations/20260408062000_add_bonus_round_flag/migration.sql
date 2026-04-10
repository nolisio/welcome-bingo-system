-- Add a flag to mark rounds that use the hidden bonus-time flow.
ALTER TABLE "Round"
ADD COLUMN "isBonusRound" BOOLEAN NOT NULL DEFAULT false;
