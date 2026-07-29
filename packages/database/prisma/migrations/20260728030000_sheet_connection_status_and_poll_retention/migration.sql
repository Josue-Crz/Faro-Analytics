ALTER TYPE "SheetConnectionStatus"
ADD VALUE IF NOT EXISTS 'ATTEMPTING';

ALTER TABLE "SheetSyncRun"
ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'MANUAL_IMPORT';

CREATE INDEX "SheetSyncRun_workspaceId_sheetConnectionId_trigger_startedAt_idx"
ON "SheetSyncRun"("workspaceId", "sheetConnectionId", "trigger", "startedAt");
