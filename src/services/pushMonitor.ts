import { getUnsentItems, markSent }           from '../db/itemsRepo';
import { rankingService, refreshInterestCache } from './ranking';
import { sendMessage }                         from './telegram';
import { logger }                              from '../utils/logger';
import { RankedItem, SourceType }              from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────

const PUSH_SCORE_THRESHOLD  = 72;   // only truly strong items
const PUSH_LOOKBACK_HOURS   = 4;    // look back this many hours each scan
const MAX_PUSH_PER_SCAN     = 2;    // never send more than 2 push alerts at once

// In-memory set to prevent re-pushing within a process lifetime
const pushedIds = new Set<string>();

// ─── Format ───────────────────────────────────────────────────────────────────

const TYPE_EMOJI: Partial<Record<SourceType, string>> = {
  [SourceType.YouTube]:      '🎬',
  [SourceType.RSS]:          '📄',
  [SourceType.Telegram]:     '📢',
  [SourceType.DeepKnowledge]:'📚',
  [SourceType.Website]:      '🌐',
  [SourceType.Official]:     '🏢',
};

function formatPushAlert(item: RankedItem): string {
  const emoji     = TYPE_EMOJI[item.sourceType] ?? '📌';
  const scoreBar  = '█'.repeat(Math.round(item.score / 10)) + '░'.repeat(10 - Math.round(item.score / 10));
  const src       = item.sourceName ?? item.source;
  const snippet   = item.content.slice(0, 200).replace(/\n/g, ' ');
  const urlLine   = item.url ? `\n🔗 ${item.url}` : '';

  return (
    `${emoji} *Стоит открыть сейчас*\n\n` +
    `*${item.title}*\n` +
    `_${src}_\n\n` +
    `${snippet}${urlLine}\n\n` +
    `${scoreBar} ${item.score}/100`
  );
}

// ─── Core scan ────────────────────────────────────────────────────────────────

export async function runPushScan(): Promise<void> {
  const since = new Date(Date.now() - PUSH_LOOKBACK_HOURS * 3_600_000);

  let rawItems;
  try {
    rawItems = await getUnsentItems(since, 60);
  } catch (err) {
    logger.warn(`[push] DB query failed: ${(err as Error).message}`);
    return;
  }

  if (rawItems.length === 0) return;

  await refreshInterestCache();
  const ranked   = rankingService.rank(rawItems);

  const pushable = ranked
    .filter((item) => item.score >= PUSH_SCORE_THRESHOLD && !pushedIds.has(item.id));

  if (pushable.length === 0) {
    logger.info(`[push] scan: ${ranked.length} items ranked, none above threshold (${PUSH_SCORE_THRESHOLD})`);
    return;
  }

  logger.info(`[push] ${pushable.length} push-worthy items found`);

  for (const item of pushable.slice(0, MAX_PUSH_PER_SCAN)) {
    pushedIds.add(item.id);
    try {
      await sendMessage(formatPushAlert(item));
      await markSent([item.id]);
      logger.info(`[push] sent: "${item.title.slice(0, 60)}" score=${item.score}`);
    } catch (err) {
      logger.warn(`[push] send failed: ${(err as Error).message}`);
    }
  }
}
