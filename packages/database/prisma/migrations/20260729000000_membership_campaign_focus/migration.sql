-- Campaign focus is stored on a workspace membership so each user can keep an
-- independent, durable view without changing the underlying workspace.
ALTER TABLE "Membership" ADD COLUMN "focusedCampaignId" TEXT;

CREATE INDEX "Membership_workspaceId_focusedCampaignId_idx"
ON "Membership"("workspaceId", "focusedCampaignId");

ALTER TABLE "Membership"
ADD CONSTRAINT "Membership_focusedCampaignId_workspaceId_fkey"
FOREIGN KEY ("focusedCampaignId", "workspaceId")
REFERENCES "Campaign"("id", "workspaceId")
ON DELETE RESTRICT
ON UPDATE CASCADE;
