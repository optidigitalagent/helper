import { allAdapters } from '../adapters';
import { NormalizedItem } from '../types';
import { upsertItems } from '../db/itemsRepo';
import { logger } from '../utils/logger';

export async function collectAll(since: Date | null): Promise<NormalizedItem[]> {
  const results: NormalizedItem[] = [];

  await Promise.allSettled(
    allAdapters.map(async (adapter) => {
      try {
        const items = await adapter.fetch(since);
        logger.info(`[collector] ${adapter.name}: ${items.length} items`);
        results.push(...items);
      } catch (err) {
        logger.error(`[collector] ${adapter.name} failed:`, err);
      }
    })
  );

  if (results.length > 0) {
    await upsertItems(results);
    logger.info(`[collector] total fetched: ${results.length}`);
  }

  return results;
}
