import { allAdapters }    from '../adapters';
import { loadUserAdapters } from '../adapters/userSources';
import { normalizer }     from './normalizer';
import { rankingService, SOURCE_WEIGHTS, refreshInterestCache } from './ranking';
import { clusterItems }  from './clustering';
import { generateBriefWithAgents } from '../agents/digestOrchestrator';
import { sendMessage }   from './telegram';
import { isSkipped }     from './botCommands';
import { upsertItems, getUnsentItems, markSent, saveDigest, getLastDigest } from '../db/itemsRepo';
import { config }        from '../config';
import { logger }        from '../utils/logger';
import { NormalizedItem, Category, SourceType } from '../types';
import { recordSourceSignal }  from '../db/sourceReputationRepo';
import { fillGapsWithSearch }  from './webSearch';

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

let _pipelineRunning = false;

export async function runDigestPipeline(opts?: { scheduled?: boolean }): Promise<void> {
  if (_pipelineRunning) {
    logger.warn('[pipeline] already running — skipping duplicate call');
    return;
  }

  // Guard: scheduled runs only — skip if digest was already sent today
  if (opts?.scheduled) {
    const last = await getLastDigest().catch(() => null);
    if (last) {
      const tz       = config.timezone;
      const todayStr = new Date().toLocaleDateString('sv', { timeZone: tz });
      const lastStr  = new Date(last.createdAt).toLocaleDateString('sv', { timeZone: tz });
      if (todayStr === lastStr) {
        logger.info('[pipeline] daily digest already sent today — skipping');
        return;
      }
    }
  }

  _pipelineRunning = true;
  try {
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

  // 3b. Fill sparse categories with Tavily web search
  const grouped = new Map<Category, NormalizedItem[]>();
  for (const item of deduped_normalized) {
    const arr = grouped.get(item.category) ?? [];
    arr.push(item);
    grouped.set(item.category, arr);
  }
  const webItems = await fillGapsWithSearch(grouped);
  if (webItems.length > 0) {
    const webNormalized = normalizer.normalize(
      webItems.map((item) => ({
        source: item.source, sourceType: item.sourceType,
        title: item.title, content: item.content,
        url: item.url, timestamp: item.timestamp.toISOString(),
        category: item.category,
      }))
    );
    // Dedupe web items against already-stored items
    const webSeen = new Set<string>(deduped_normalized.map((i) => i.id));
    const webNew  = webNormalized.filter((i) => !webSeen.has(i.id));
    if (webNew.length > 0) await upsertItems(webNew);
    logger.info(`[pipeline] web search added: ${webNew.length} items`);
  }

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

  // 6. Generate brief — 5 blocks in parallel, each via its own agent
  const messages = await generateBriefWithAgents(ranked);

  // 7. Send each message separately
  for (const msg of messages) {
    await sendMessage(msg);
  }

  // 8. Archive (store all messages joined)
  const sentIds = ranked.map((i) => i.id);
  await markSent(sentIds);
  await saveDigest(messages.join('\n\n─────────────────\n\n'), sentIds);

  // 9. Update source reputation — every source that made it into the digest gets a signal
  await Promise.allSettled(
    ranked.map((item) =>
      recordSourceSignal(
        item.source,
        item.sourceName ?? item.source,
        undefined,
        item.score,
        'digest_sent',
      )
    )
  );

  logger.info(`[pipeline] done — ${messages.length} message(s) sent, ${sentIds.length} items archived`);
  } finally {
    _pipelineRunning = false;
  }
}
