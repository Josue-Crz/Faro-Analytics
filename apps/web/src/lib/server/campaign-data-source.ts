import type { Prisma } from '@faro/database';

const googleSheetsSourcePrefix = 'google-sheets:';

export function campaignContactSourceWhere(
  sheetConnectionId: string | null,
): Prisma.ContactWhereInput {
  if (!sheetConnectionId) return {};
  return {
    OR: [
      { source: `${googleSheetsSourcePrefix}${sheetConnectionId}` },
      { source: null },
      { source: { not: { startsWith: googleSheetsSourcePrefix } } },
    ],
  };
}

export function isCampaignContactSourceEligible(
  contactSource: string | null,
  sheetConnectionId: string | null,
): boolean {
  if (!sheetConnectionId || !contactSource) return true;
  if (!contactSource.startsWith(googleSheetsSourcePrefix)) return true;
  return contactSource === `${googleSheetsSourcePrefix}${sheetConnectionId}`;
}
