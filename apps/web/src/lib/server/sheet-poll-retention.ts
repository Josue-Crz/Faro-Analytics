import type { Prisma } from '@faro/database';

import { SHEET_POLL_LOG_LIMIT } from '../sheet-polling';

export const AUTOMATIC_POLL_LOG_LIMIT = SHEET_POLL_LOG_LIMIT;

type PollRunDatabase = Pick<Prisma.TransactionClient, 'sheetSyncRun'>;

export async function pruneAutomaticSheetPollRuns(
  database: PollRunDatabase,
  workspaceId: string,
  sheetConnectionId: string,
): Promise<number> {
  const staleRuns = await database.sheetSyncRun.findMany({
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
    skip: AUTOMATIC_POLL_LOG_LIMIT,
    where: {
      sheetConnectionId,
      trigger: 'AUTOMATIC_POLL',
      workspaceId,
    },
  });
  if (!staleRuns.length) return 0;
  const deleted = await database.sheetSyncRun.deleteMany({
    where: {
      id: { in: staleRuns.map((run) => run.id) },
      sheetConnectionId,
      trigger: 'AUTOMATIC_POLL',
      workspaceId,
    },
  });
  return deleted.count;
}
