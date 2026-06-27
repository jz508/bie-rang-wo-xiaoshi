import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  bieRangWoXiaoshiPrisma?: PrismaClient;
};

export function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.bieRangWoXiaoshiPrisma) {
    globalForPrisma.bieRangWoXiaoshiPrisma = new PrismaClient();
  }

  return globalForPrisma.bieRangWoXiaoshiPrisma;
}
