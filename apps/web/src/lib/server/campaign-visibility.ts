export function nonArchivedCampaignWorkWhere(campaignId: string | null | undefined) {
  return {
    campaign: { archivedAt: null },
    ...(campaignId ? { campaignId } : {}),
  };
}

export function visibleInteractionCampaignWhere(campaignId: string | null | undefined) {
  return campaignId
    ? nonArchivedCampaignWorkWhere(campaignId)
    : {
        OR: [{ campaignId: null }, { campaign: { archivedAt: null } }],
      };
}
