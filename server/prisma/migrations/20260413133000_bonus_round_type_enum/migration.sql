CREATE TYPE "BonusRoundType" AS ENUM ('NONE', 'MAJORITY', 'QUIZ');

ALTER TABLE "Round"
ADD COLUMN "bonusRoundType_new" "BonusRoundType" NOT NULL DEFAULT 'NONE';

UPDATE "Round"
SET "bonusRoundType_new" = CASE
  WHEN "bonusRoundType" = 'MAJORITY' THEN 'MAJORITY'::"BonusRoundType"
  WHEN "bonusRoundType" = 'QUIZ' THEN 'QUIZ'::"BonusRoundType"
  ELSE 'NONE'::"BonusRoundType"
END;

ALTER TABLE "Round"
DROP COLUMN "bonusRoundType";

ALTER TABLE "Round"
RENAME COLUMN "bonusRoundType_new" TO "bonusRoundType";
