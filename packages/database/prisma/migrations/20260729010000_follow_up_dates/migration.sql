ALTER TABLE "FollowUpTask"
ADD COLUMN "initialAt" TIMESTAMP(3);

UPDATE "FollowUpTask"
SET "initialAt" = LEAST("createdAt", "dueAt")
WHERE "initialAt" IS NULL;

ALTER TABLE "FollowUpTask"
ALTER COLUMN "initialAt" SET NOT NULL;

ALTER TABLE "FollowUpTask"
ADD CONSTRAINT "FollowUpTask_initialAt_before_dueAt_check"
CHECK ("initialAt" <= "dueAt");

CREATE INDEX "FollowUpTask_workspaceId_initialAt_dueAt_idx"
ON "FollowUpTask"("workspaceId", "initialAt", "dueAt");
