/**
 * Serializable transaction with P2034 retry (Prisma write-conflict/deadlock).
 *
 * Why: the default READ COMMITTED isolation does not defend against two
 * concurrent requests computing the same `max(position)+1` — both read the
 * same maximum and insert duplicates. SERIALIZABLE + retry closes the hole
 * on both PostgreSQL and SQLite (Prisma maps it to the strongest available
 * level on SQLite).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function withSerializableTx<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (err) {
      if ((err as { code?: string }).code === "P2034" && attempt < 3) continue;
      throw err;
    }
  }
}
