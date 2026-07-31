export interface OutreachRequestSummary {
  campaignId: string;
  contactId: string;
  draft: { id: string } | null;
  followUpTaskId: string | null;
  id: string;
  requestedAt: string;
}

function newestFirst(
  left: Pick<OutreachRequestSummary, 'requestedAt'>,
  right: Pick<OutreachRequestSummary, 'requestedAt'>,
) {
  return new Date(right.requestedAt).getTime() - new Date(left.requestedAt).getTime();
}

export function findAssociatedOutreachRequest<T extends OutreachRequestSummary>(
  requests: T[],
  followUp: { campaignId: string; contactId: string; id: string },
): T | undefined {
  const newest = [...requests].sort(newestFirst);
  const exactRequests = newest.filter((request) => request.followUpTaskId === followUp.id);
  const campaignContactRequests = newest.filter(
    (request) =>
      request.campaignId === followUp.campaignId && request.contactId === followUp.contactId,
  );

  return (
    exactRequests.find((request) => request.draft) ??
    campaignContactRequests.find((request) => request.draft) ??
    exactRequests[0] ??
    campaignContactRequests[0]
  );
}

export function outreachRequestHref(request: OutreachRequestSummary): string {
  const query = new URLSearchParams({
    contact: request.contactId,
    request: request.id,
  });
  if (request.draft) query.set('draft', request.draft.id);
  const targetId = request.draft
    ? `outreach-draft-${request.draft.id}`
    : `outreach-request-${request.id}`;
  return `/outreach?${query.toString()}#${targetId}`;
}
