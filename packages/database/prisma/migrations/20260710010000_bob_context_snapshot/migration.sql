-- Preserve the exact governed request that IBM Bob is authorized to retrieve.
ALTER TABLE "BobGenerationRequest"
ADD COLUMN "promptText" TEXT NOT NULL DEFAULT '',
ADD COLUMN "approvedSourceRecordIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "startedAt" TIMESTAMP(3);
