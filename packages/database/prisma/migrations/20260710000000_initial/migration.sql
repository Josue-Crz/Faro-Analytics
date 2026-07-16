-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PARTICIPANT', 'SPONSOR', 'PARTNER', 'DONOR', 'SPEAKER', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('EMAIL', 'PHONE', 'SMS', 'MEETING', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('OPTED_IN', 'IMPLIED', 'UNKNOWN', 'OPTED_OUT');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('SPONSOR', 'PARTNER', 'NONPROFIT', 'CORPORATION', 'EDUCATION', 'GOVERNMENT', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('SPONSORSHIP', 'PARTICIPANT_OUTREACH', 'PARTNERSHIP', 'FUNDRAISING', 'EVENT', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OutreachTone" AS ENUM ('PROFESSIONAL', 'WARM', 'CONCISE', 'CONSULTATIVE', 'PARTNERSHIP_FOCUSED', 'SPONSORSHIP_FOCUSED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "InteractionDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'RECEIVED');

-- CreateEnum
CREATE TYPE "ResponseClassification" AS ENUM ('INTERESTED', 'NEEDS_MORE_INFORMATION', 'MEETING_REQUESTED', 'REFERRED', 'FOLLOW_UP_LATER', 'DECLINED', 'OUT_OF_OFFICE', 'UNSUBSCRIBE', 'NO_ACTIONABLE_INTENT', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AnalysisProvenance" AS ENUM ('HUMAN', 'DEMO_FIXTURE', 'IBM_BOB');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'EDITED', 'SNOOZED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "DataSufficiency" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'INSUFFICIENT');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('OPEN', 'SNOOZED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BobGenerationType" AS ENUM ('OUTREACH_DRAFT', 'RESPONSE_ANALYSIS', 'RECOMMENDATION_EXPLANATION');

-- CreateEnum
CREATE TYPE "BobGenerationStatus" AS ENUM ('AWAITING_BOB', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DraftProvenance" AS ENUM ('DEMO_DRAFT', 'IBM_BOB');

-- CreateEnum
CREATE TYPE "DraftApprovalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'WEB_PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('SCHEDULED', 'SENT', 'PREVIEWED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SheetSyncDirection" AS ENUM ('IMPORT', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "SheetConnectionStatus" AS ENUM ('CONNECTED', 'NEEDS_AUTH', 'SYNC_ISSUE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SheetSyncStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'DRY_RUN');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'IBM_BOB', 'MCP', 'WORKER');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultTimezone" TEXT NOT NULL,
    "quietHoursStart" TEXT NOT NULL,
    "quietHoursEnd" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "notificationPreferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "SponsorshipPipelineStage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SponsorshipPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sponsorshipStageId" TEXT,
    "name" TEXT NOT NULL,
    "type" "OrganizationType" NOT NULL,
    "industry" TEXT,
    "website" TEXT,
    "estimatedValue" INTEGER NOT NULL DEFAULT 0,
    "interestAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "organizationId" TEXT,
    "ownerId" TEXT,
    "type" "ContactType" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "timezone" TEXT NOT NULL,
    "preferredChannel" "ContactChannel" NOT NULL,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "suppressedAt" TIMESTAMP(3),
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "CampaignType" NOT NULL,
    "objective" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "defaultTone" "OutreachTone" NOT NULL,
    "quietHours" JSONB NOT NULL DEFAULT '{}',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignContact" (
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "assignedUserId" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignContact_pkey" PRIMARY KEY ("workspaceId","campaignId","contactId")
);

-- CreateTable
CREATE TABLE "Interaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT,
    "contactId" TEXT NOT NULL,
    "channel" "ContactChannel" NOT NULL,
    "direction" "InteractionDirection" NOT NULL,
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "externalMessageId" TEXT,
    "deliveryStatus" "DeliveryStatus" NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "interactionId" TEXT NOT NULL,
    "classification" "ResponseClassification" NOT NULL,
    "proposedClassification" "ResponseClassification",
    "sentiment" "Sentiment" NOT NULL,
    "proposedSentiment" "Sentiment",
    "urgency" "Urgency" NOT NULL,
    "proposedUrgency" "Urgency",
    "responseTimeMinutes" INTEGER NOT NULL,
    "keyQuestion" TEXT,
    "recommendedNextAction" TEXT,
    "suggestedFollowUpAt" TIMESTAMP(3),
    "humanReviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "analysisProvenance" "AnalysisProvenance" NOT NULL,
    "structuredMetadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachRecommendation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "recommendedAt" TIMESTAMP(3) NOT NULL,
    "alternativeWindows" TIMESTAMP(3)[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "dataSufficiency" "DataSufficiency" NOT NULL,
    "reasonCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "explanation" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "acceptedAt" TIMESTAMP(3),
    "userAdjustedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "outcomeImproved" BOOLEAN,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "Priority" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "lastResponseSummary" TEXT,
    "recommendedNextAction" TEXT,
    "lastNotificationAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BobGenerationRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "followUpTaskId" TEXT,
    "type" "BobGenerationType" NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "contextVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "BobGenerationStatus" NOT NULL DEFAULT 'AWAITING_BOB',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BobGenerationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BobDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "generationRequestId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "rationale" TEXT NOT NULL,
    "recommendedNextAction" TEXT NOT NULL,
    "suggestedFollowUpAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION NOT NULL,
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceRecordIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "provenance" "DraftProvenance" NOT NULL,
    "providerOperationId" TEXT,
    "approvalStatus" "DraftApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BobDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "followUpTaskId" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "deduplicationKey" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "worksheetId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "syncDirection" "SheetSyncDirection" NOT NULL,
    "schedule" TEXT,
    "syncCursor" TEXT,
    "credentialReference" TEXT,
    "writeBackEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "status" "SheetConnectionStatus" NOT NULL DEFAULT 'NEEDS_AUTH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetFieldMapping" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sheetConnectionId" TEXT NOT NULL,
    "sourceColumn" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transformation" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetFieldMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SheetSyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sheetConnectionId" TEXT NOT NULL,
    "status" "SheetSyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsCreated" INTEGER NOT NULL DEFAULT 0,
    "rowsUpdated" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "rowsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "cursorBefore" TEXT,
    "cursorAfter" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SheetSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipPipelineStage_id_workspaceId_key" ON "SponsorshipPipelineStage"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipPipelineStage_workspaceId_name_key" ON "SponsorshipPipelineStage"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorshipPipelineStage_workspaceId_position_key" ON "SponsorshipPipelineStage"("workspaceId", "position");

-- CreateIndex
CREATE INDEX "Organization_workspaceId_name_idx" ON "Organization"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Organization_workspaceId_sponsorshipStageId_idx" ON "Organization"("workspaceId", "sponsorshipStageId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_id_workspaceId_key" ON "Organization"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_workspaceId_externalId_key" ON "Organization"("workspaceId", "externalId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_organizationId_idx" ON "Contact"("workspaceId", "organizationId");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_type_idx" ON "Contact"("workspaceId", "type");

-- CreateIndex
CREATE INDEX "Contact_workspaceId_consentStatus_suppressedAt_idx" ON "Contact"("workspaceId", "consentStatus", "suppressedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_id_workspaceId_key" ON "Contact"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_externalId_key" ON "Contact"("workspaceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_workspaceId_email_key" ON "Contact"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Campaign_workspaceId_status_startAt_idx" ON "Campaign"("workspaceId", "status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_id_workspaceId_key" ON "Campaign"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_workspaceId_idempotencyKey_key" ON "Campaign"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CampaignContact_workspaceId_assignedUserId_nextActionAt_idx" ON "CampaignContact"("workspaceId", "assignedUserId", "nextActionAt");

-- CreateIndex
CREATE INDEX "Interaction_workspaceId_contactId_occurredAt_idx" ON "Interaction"("workspaceId", "contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "Interaction_workspaceId_campaignId_occurredAt_idx" ON "Interaction"("workspaceId", "campaignId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_id_workspaceId_key" ON "Interaction"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_workspaceId_externalMessageId_key" ON "Interaction"("workspaceId", "externalMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Interaction_workspaceId_idempotencyKey_key" ON "Interaction"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Response_workspaceId_classification_createdAt_idx" ON "Response"("workspaceId", "classification", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Response_id_workspaceId_key" ON "Response"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Response_interactionId_workspaceId_key" ON "Response"("interactionId", "workspaceId");

-- CreateIndex
CREATE INDEX "OutreachRecommendation_workspaceId_contactId_recommendedAt_idx" ON "OutreachRecommendation"("workspaceId", "contactId", "recommendedAt");

-- CreateIndex
CREATE INDEX "OutreachRecommendation_workspaceId_status_recommendedAt_idx" ON "OutreachRecommendation"("workspaceId", "status", "recommendedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachRecommendation_id_workspaceId_key" ON "OutreachRecommendation"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachRecommendation_workspaceId_idempotencyKey_key" ON "OutreachRecommendation"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "FollowUpTask_workspaceId_status_dueAt_idx" ON "FollowUpTask"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_workspaceId_assignedUserId_status_dueAt_idx" ON "FollowUpTask"("workspaceId", "assignedUserId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpTask_id_workspaceId_key" ON "FollowUpTask"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpTask_workspaceId_idempotencyKey_key" ON "FollowUpTask"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BobGenerationRequest_workspaceId_status_requestedAt_idx" ON "BobGenerationRequest"("workspaceId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BobGenerationRequest_id_workspaceId_key" ON "BobGenerationRequest"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BobGenerationRequest_workspaceId_idempotencyKey_key" ON "BobGenerationRequest"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BobDraft_workspaceId_approvalStatus_generatedAt_idx" ON "BobDraft"("workspaceId", "approvalStatus", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BobDraft_id_workspaceId_key" ON "BobDraft"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BobDraft_generationRequestId_workspaceId_key" ON "BobDraft"("generationRequestId", "workspaceId");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_userId_status_scheduledFor_idx" ON "Notification"("workspaceId", "userId", "status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_workspaceId_deduplicationKey_key" ON "Notification"("workspaceId", "deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_id_workspaceId_key" ON "Notification"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "SheetConnection_workspaceId_status_idx" ON "SheetConnection"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SheetConnection_id_workspaceId_key" ON "SheetConnection"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetConnection_workspaceId_spreadsheetId_worksheetId_key" ON "SheetConnection"("workspaceId", "spreadsheetId", "worksheetId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetFieldMapping_workspaceId_sheetConnectionId_sourceColum_key" ON "SheetFieldMapping"("workspaceId", "sheetConnectionId", "sourceColumn", "targetEntity", "targetField");

-- CreateIndex
CREATE UNIQUE INDEX "SheetFieldMapping_id_workspaceId_key" ON "SheetFieldMapping"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "SheetSyncRun_workspaceId_sheetConnectionId_startedAt_idx" ON "SheetSyncRun"("workspaceId", "sheetConnectionId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SheetSyncRun_id_workspaceId_key" ON "SheetSyncRun"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SheetSyncRun_workspaceId_idempotencyKey_key" ON "SheetSyncRun"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_occurredAt_idx" ON "AuditEvent"("workspaceId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_entityType_entityId_idx" ON "AuditEvent"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_action_occurredAt_idx" ON "AuditEvent"("workspaceId", "action", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEvent_id_workspaceId_key" ON "AuditEvent"("id", "workspaceId");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SponsorshipPipelineStage" ADD CONSTRAINT "SponsorshipPipelineStage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_sponsorshipStageId_workspaceId_fkey" FOREIGN KEY ("sponsorshipStageId", "workspaceId") REFERENCES "SponsorshipPipelineStage"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_organizationId_workspaceId_fkey" FOREIGN KEY ("organizationId", "workspaceId") REFERENCES "Organization"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_campaignId_workspaceId_fkey" FOREIGN KEY ("campaignId", "workspaceId") REFERENCES "Campaign"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContact" ADD CONSTRAINT "CampaignContact_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_campaignId_workspaceId_fkey" FOREIGN KEY ("campaignId", "workspaceId") REFERENCES "Campaign"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_interactionId_workspaceId_fkey" FOREIGN KEY ("interactionId", "workspaceId") REFERENCES "Interaction"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachRecommendation" ADD CONSTRAINT "OutreachRecommendation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachRecommendation" ADD CONSTRAINT "OutreachRecommendation_campaignId_workspaceId_fkey" FOREIGN KEY ("campaignId", "workspaceId") REFERENCES "Campaign"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachRecommendation" ADD CONSTRAINT "OutreachRecommendation_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_campaignId_workspaceId_fkey" FOREIGN KEY ("campaignId", "workspaceId") REFERENCES "Campaign"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_recommendationId_workspaceId_fkey" FOREIGN KEY ("recommendationId", "workspaceId") REFERENCES "OutreachRecommendation"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobGenerationRequest" ADD CONSTRAINT "BobGenerationRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobGenerationRequest" ADD CONSTRAINT "BobGenerationRequest_contactId_workspaceId_fkey" FOREIGN KEY ("contactId", "workspaceId") REFERENCES "Contact"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobGenerationRequest" ADD CONSTRAINT "BobGenerationRequest_campaignId_workspaceId_fkey" FOREIGN KEY ("campaignId", "workspaceId") REFERENCES "Campaign"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobGenerationRequest" ADD CONSTRAINT "BobGenerationRequest_followUpTaskId_workspaceId_fkey" FOREIGN KEY ("followUpTaskId", "workspaceId") REFERENCES "FollowUpTask"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobGenerationRequest" ADD CONSTRAINT "BobGenerationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobDraft" ADD CONSTRAINT "BobDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobDraft" ADD CONSTRAINT "BobDraft_generationRequestId_workspaceId_fkey" FOREIGN KEY ("generationRequestId", "workspaceId") REFERENCES "BobGenerationRequest"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BobDraft" ADD CONSTRAINT "BobDraft_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_followUpTaskId_workspaceId_fkey" FOREIGN KEY ("followUpTaskId", "workspaceId") REFERENCES "FollowUpTask"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetConnection" ADD CONSTRAINT "SheetConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetFieldMapping" ADD CONSTRAINT "SheetFieldMapping_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetFieldMapping" ADD CONSTRAINT "SheetFieldMapping_sheetConnectionId_workspaceId_fkey" FOREIGN KEY ("sheetConnectionId", "workspaceId") REFERENCES "SheetConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSyncRun" ADD CONSTRAINT "SheetSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SheetSyncRun" ADD CONSTRAINT "SheetSyncRun_sheetConnectionId_workspaceId_fkey" FOREIGN KEY ("sheetConnectionId", "workspaceId") REFERENCES "SheetConnection"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


