ALTER TABLE "Round"
ADD COLUMN "bonusRoundType" TEXT NOT NULL DEFAULT 'NONE',
ADD COLUMN "correctChoice" TEXT;

UPDATE "Round"
SET "bonusRoundType" = CASE
  WHEN "isBonusRound" = true THEN 'MAJORITY'
  ELSE 'NONE'
END
WHERE "bonusRoundType" = 'NONE';
