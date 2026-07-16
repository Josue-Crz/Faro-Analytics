import { prisma } from '@faro/database';
import { InMemoryBobGenerationRequestStore } from '@faro/ibm-bob';
import type { BobGenerationRequestStore } from '@faro/ibm-bob';
import { PrismaBobGenerationRequestStore } from '@faro/mcp';

const globalStore = globalThis as typeof globalThis & {
  faroBobRequestStore?: BobGenerationRequestStore;
};

export const bobRequestStoreMode =
  process.env.FARO_DATA_SOURCE === 'database' && Boolean(process.env.DATABASE_URL)
    ? 'postgresql'
    : 'web-process-memory';

/** Database mode is shared with Faro MCP; demo mode stays explicitly process-local. */
export const bobRequestStore =
  globalStore.faroBobRequestStore ??
  (globalStore.faroBobRequestStore =
    bobRequestStoreMode === 'postgresql'
      ? new PrismaBobGenerationRequestStore(prisma)
      : new InMemoryBobGenerationRequestStore());
