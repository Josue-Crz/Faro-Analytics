CREATE TYPE "ContactNextActionType" AS ENUM (
  'INITIAL_OUTREACH',
  'FOLLOW_UP',
  'CONSENT_REVIEW',
  'SCHEDULE_REVIEW'
);

ALTER TABLE "Contact"
ADD COLUMN "nextActionAt" TIMESTAMP(3),
ADD COLUMN "nextActionType" "ContactNextActionType";

UPDATE "Contact" AS contact
SET
  "nextActionAt" = COALESCE(
    (
      SELECT MIN(follow_up."dueAt")
      FROM "FollowUpTask" AS follow_up
      WHERE follow_up."contactId" = contact."id"
        AND follow_up."workspaceId" = contact."workspaceId"
        AND follow_up."status" IN ('OPEN', 'SNOOZED')
        AND follow_up."dueAt" > CURRENT_TIMESTAMP
    ),
    CURRENT_TIMESTAMP + INTERVAL '1 day'
  ),
  "nextActionType" = CASE
    WHEN contact."suppressedAt" IS NOT NULL
      OR contact."consentStatus" IN ('UNKNOWN', 'OPTED_OUT')
      THEN 'CONSENT_REVIEW'::"ContactNextActionType"
    WHEN EXISTS (
      SELECT 1
      FROM "FollowUpTask" AS follow_up
      WHERE follow_up."contactId" = contact."id"
        AND follow_up."workspaceId" = contact."workspaceId"
        AND follow_up."status" IN ('OPEN', 'SNOOZED')
    )
      OR EXISTS (
      SELECT 1
      FROM "Interaction" AS interaction
      WHERE interaction."contactId" = contact."id"
        AND interaction."workspaceId" = contact."workspaceId"
        AND interaction."direction" = 'OUTBOUND'
    )
      THEN 'FOLLOW_UP'::"ContactNextActionType"
    ELSE 'INITIAL_OUTREACH'::"ContactNextActionType"
  END;

ALTER TABLE "Contact"
ALTER COLUMN "nextActionAt" SET NOT NULL,
ALTER COLUMN "nextActionType" SET NOT NULL;

CREATE INDEX "Contact_workspaceId_nextActionAt_nextActionType_idx"
ON "Contact"("workspaceId", "nextActionAt", "nextActionType");
