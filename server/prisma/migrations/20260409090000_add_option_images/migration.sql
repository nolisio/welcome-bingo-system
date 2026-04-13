ALTER TABLE "Round"
ADD COLUMN "optionAImageUrl" TEXT,
ADD COLUMN "optionBImageUrl" TEXT;

ALTER TABLE "PreparedQuestion"
ADD COLUMN "optionAImageUrl" TEXT,
ADD COLUMN "optionBImageUrl" TEXT;
