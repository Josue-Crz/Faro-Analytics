import type { Prisma } from '@faro/database';
import { describe, expect, it, vi } from 'vitest';

import { AUTOMATIC_POLL_LOG_LIMIT, pruneAutomaticSheetPollRuns } from './sheet-poll-retention';

function databaseWith(staleIds: string[]) {
  const findMany = vi.fn(async () => staleIds.map((id) => ({ id })));
  const deleteMany = vi.fn(async () => ({ count: staleIds.length }));
  return {
    database: {
      sheetSyncRun: { deleteMany, findMany },
    } as unknown as Pick<Prisma.TransactionClient, 'sheetSyncRun'>,
    deleteMany,
    findMany,
  };
}

describe('automatic Sheet poll retention', () => {
  it('keeps the newest 10 automatic poll runs for one connection', async () => {
    const { database, deleteMany, findMany } = databaseWith(['poll-old-1', 'poll-old-2']);
    await expect(
      pruneAutomaticSheetPollRuns(database, 'workspace-a', 'connection-a'),
    ).resolves.toBe(2);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: AUTOMATIC_POLL_LOG_LIMIT,
        where: {
          sheetConnectionId: 'connection-a',
          trigger: 'AUTOMATIC_POLL',
          workspaceId: 'workspace-a',
        },
      }),
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['poll-old-1', 'poll-old-2'] },
        sheetConnectionId: 'connection-a',
        trigger: 'AUTOMATIC_POLL',
        workspaceId: 'workspace-a',
      },
    });
  });

  it('does not issue a delete when there are at most 10 runs', async () => {
    const { database, deleteMany } = databaseWith([]);
    await expect(
      pruneAutomaticSheetPollRuns(database, 'workspace-a', 'connection-a'),
    ).resolves.toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
