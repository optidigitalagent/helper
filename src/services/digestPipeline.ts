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
import { NormalizedItem, MorningBrief, CATEGORY_LABELS } from '../types';

export async function runDigestPipeline(): Promise<void> {
  logger.info('[pipeline] starting');

  const since = new Date(Date.now() - config.lookbackHours * 3_600_000);

  // 1. Collect (static + user-added adapters)
  const userAdapters = await loadUserAdapters();
  const adapters     = [...allAdapters, ...userAdapters];

  const rawItems: NormalizedItem[] = [];
  await Promise.allSettled(
    adapters.map(async (adapter) => {
      try {
        const items = await adapter.fetch(since);
        logger.info(`[pipeline] ${adapter.name}: ${items.length} items`);
        rawItems.push(...items);
      } catch (err) {
        logger.error(`[pipeline] ${adapter.name} failed:`, err);
      }
    })
  );
  logger.info(`[pipeline] collected: ${rawItems.length} total`);

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

  // 3. Persist
  await upsertItems(normalized);

  // 4. Load unsent (exclude skip-listed sources)
  const unsent = (await getUnsentItems(since, 100)).filter((i) => !isSkipped(i.source));
  logger.info(`[pipeline] unsent items: ${unsent.length}`);

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

  // 6. Generate brief via LLM
  const brief = await digestService.generateBrief(ranked);

  // 7. Format and send
  const message = formatBrief(brief);
  await sendMessage(message);

  // 8. Archive
  const sentIds = ranked.map((i) => i.id);
  await markSent(sentIds);
  await saveDigest(message, sentIds);

  logger.info(`[pipeline] done — digest sent with ${sentIds.length} items`);
}

// ─── Telegram Formatter ───────────────────────────────────────────────────────
// UX rules:
//   • header line only — no date noise
//   • sections separated by blank line
//   • mentor layer always at bottom
//   • closing line in italics
//   • if mentor fields are empty, skip gracefully


function formatBrief(brief: MorningBrief): string {
  const out: string[] = [`📅 *${brief.date}*`];

  // Content sections — deduplicate by label (e.g. Crypto merged into РЫНОК)
  const seenLabels = new Set<string>();
  for (const section of brief.sections) {
    const body = section.summary.trim();
    if (!body) continue;
    const label = CATEGORY_LABELS[section.category] ?? section.category.toUpperCase();
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    out.push('');
    out.push(`*${label}*`);
    out.push(body);
  }

  // Separator + focus
  out.push('\n─────────────────');

  if (brief.focus.trim()) {
    out.push(`🎯 *ФОКУС*\n${brief.focus.trim()}`);
  }

  if (brief.closingLine.trim()) {
    out.push(`\n🔥 _${brief.closingLine.trim()}_`);
  }

  return out.join('\n').trim();
}
