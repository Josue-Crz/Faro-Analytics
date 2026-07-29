ALTER TABLE "Campaign"
ADD COLUMN "sheetConnectionId" TEXT;

UPDATE "Campaign" AS campaign
SET "sheetConnectionId" = (
  SELECT connection.id
  FROM "SheetConnection" AS connection
  WHERE connection."workspaceId" = campaign."workspaceId"
  ORDER BY connection."lastSyncedAt" DESC NULLS LAST, connection."updatedAt" DESC
  LIMIT 1
);

ALTER TABLE "Campaign"
ADD CONSTRAINT "Campaign_sheetConnectionId_workspaceId_fkey"
FOREIGN KEY ("sheetConnectionId", "workspaceId")
REFERENCES "SheetConnection"("id", "workspaceId")
ON DELETE RESTRICT
ON UPDATE CASCADE;

CREATE INDEX "Campaign_workspaceId_sheetConnectionId_idx"
ON "Campaign"("workspaceId", "sheetConnectionId");
