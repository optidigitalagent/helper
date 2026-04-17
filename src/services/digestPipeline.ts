import { allAdapters }    from '../adapters';
import { loadUserAdapters } from '../adapters/userSources';
import { normalizer }     from './normalizer';
import { rankingService, SOURCE_WEIGHTS, refreshInterestCache } from './ranking';
import { clusterItems }  from './clustering';
import { digestService } from './digestService';
import { sendMessage }   from './telegram';
import { isSkipped }     from './botCommands';
import { upsertItems, getUnsentItems, markSent, saveDigest } from '../db/itemsRepo';
import { config }        from '../config';
import { logger }        from '../utils/logger';
import { NormalizedItem, Category, SourceType } from '../types';

// Deep/slow sources publish rarely — use a 7-day window so we never miss them
const DEEP_SOURCE_PREFIXES = ['deep_', 'yt_', 'rss_lex_fridman', 'rss_invest_like_best',
  'rss_hard_fork', 'rss_all_in_pod', 'rss_my_first_million', 'rss_knowledge_project',
  'rss_a16z_podcast', 'rss_karpathy', 'rss_interconnects', 'rss_stratechery',
  'rss_notboring', 'rss_pmarca', 'rss_lennys', 'rss_paulgraham', 'rss_the_batch',
  'rss_ruder',
];

function isDeepSource(id: string): boolean {
  return DEEP_SOURCE_PREFIXES.some((p) => id.startsWith(p));
}

const DEEP_CATEGORIES = [Category.Learning, Category.Thinking, Category.Podcast];

export async function runDigestPipeline(): Promise<void> {
  logger.info('[pipeline] starting');

  const since = new Date(Date.now() - config.lookbackHours * 3_600_000);

  // 1. Collect (static + user-added adapters)
  const userAdapters = await loadUserAdapters();
  const adapters     = [...allAdapters, ...userAdapters];

  const deepSince = new Date(Date.now() - 7 * 24 * 3_600_000);

  const rawItems: NormalizedItem[] = [];
  const fetchStart = Date.now();
  await Promise.allSettled(
    adapters.map(async (adapter) => {
      const t0 = Date.now();
      try {
        // Deep/slow sources: 7-day window so we never get empty blocks
        const adapterSince = isDeepSource(adapter.id) ? deepSince : since;
        const items = await adapter.fetch(adapterSince);
        rawItems.push(...items);
        if (items.length > 0) {
          logger.info(`[pipeline] ${adapter.name}: ${items.length} (${Date.now() - t0}ms)`);
        }
      } catch (err) {
        logger.warn(`[pipeline] SKIP ${adapter.id} (${Date.now() - t0}ms): ${(err as Error).message}`);
      }
    })
  );
  logger.info(`[pipeline] collected: ${rawItems.length} total in ${Date.now() - fetchStart}ms`);

  if (rawItems.length === 0) {
    logger.info('[pipeline] nothing collected — aborting');
    return;
  }

  // 2. Normalize — preserves adapter-set category, runs Opportunities promotion
  const normalized = normalizer.normalize(
    rawItems.map((item) => ({
      source:     item.source,
      sourceType: item.sourceType,
      title:      item.title,
      content:    item.content,
      url:        item.url,
      timestamp:  item.timestamp.toISOString(),
      category:   item.category,
    }))
  );

  // 3. Persist — dedupe by id before upsert (same URL from 2 sources → same hash → PG error)
  const seen = new Set<string>();
  const deduped_normalized = normalized.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  await upsertItems(deduped_normalized);

  // 4. Load unsent — two windows: 36h for news, 7d for deep/slow categories
  const unsentNews  = await getUnsentItems(since, 80);
  const unsentDeep  = await getUnsentItems(deepSince, 40, DEEP_CATEGORIES);
  const seenIds     = new Set<string>();
  const unsent = [...unsentNews, ...unsentDeep]
    .filter((i) => !isSkipped(i.source))
    .filter((i) => { if (seenIds.has(i.id)) return false; seenIds.add(i.id); return true; });
  logger.info(`[pipeline] unsent items: ${unsent.length} (news: ${unsentNews.length}, deep: ${unsentDeep.length})`);

  if (unsent.length === 0) {
    logger.info('[pipeline] no unsent items — skipping digest');
    return;
  }

  // 4b. Cluster — group same-story items, mark primary + confirmations
  const clustered = clusterItems(unsent, SOURCE_WEIGHTS);
  // Only send primary items to ranker (no duplicates in brief)
  const deduped = clustered.filter((i) => i.isPrimary !== false);
  logger.info(`[pipeline] after clustering: ${deduped.length} unique stories`);

  // 5. Rank — top 22 (wide pool, LLM filters to ≤12 bullets)
  await refreshInterestCache();
  const ranked = rankingService.rank(deduped);
  logger.info(`[pipeline] ranked top: ${ranked.length}`);

  // 6. Generate brief via LLM — returns up to 3 message strings
  const messages = await digestService.generateBrief(ranked);

  // 7. Send each message separately
  for (const msg of messages) {
    await sendMessage(msg);
  }

  // 8. Archive (store all messages joined)
  const sentIds = ranked.map((i) => i.id);
  await markSent(sentIds);
  await saveDigest(messages.join('\n\n─────────────────\n\n'), sentIds);

  logger.info(`[pipeline] done — ${messages.length} message(s) sent, ${sentIds.length} items archived`);
}
