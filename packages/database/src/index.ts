import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { faroPrisma?: PrismaClient };

/** Shared Prisma client for application processes. Workers should disconnect on shutdown. */
export const prisma = globalForPrisma.faroPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.faroPrisma = prisma;
}

export * from '@prisma/client';
