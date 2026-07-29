ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "NotificationStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';

ALTER TABLE "User"
ADD COLUMN "smsPhone" TEXT,
ADD COLUMN "smsVerifiedAt" TIMESTAMP(3),
ADD COLUMN "smsConsentAt" TIMESTAMP(3),
ADD COLUMN "smsOptedOutAt" TIMESTAMP(3);

ALTER TABLE "Notification"
ADD COLUMN "provider" TEXT,
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN "readAt" TIMESTAMP(3);

CREATE INDEX "Notification_status_scheduledFor_lastAttemptAt_idx"
ON "Notification"("status", "scheduledFor", "lastAttemptAt");
