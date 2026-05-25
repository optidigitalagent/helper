import { allAdapters }    from '../adapters';
import { loadUserAdapters } from '../adapters/userSources';
import { normalizer }     from './normalizer';
import { rankingService, SOURCE_WEIGHTS, refreshInterestCache } from './ranking';
import { clusterItems }  from './clustering';
import { generateBriefWithAgents } from '../agents/digestOrchestrator';
import { sendMessage }   from './telegram';
import { isSkipped }     from './botCommands';
import { upsertItems, getUnsentItems, markSent, saveDigest, getLastDigest } from '../db/itemsRepo';
import { getRemindersForDigest } from '../db/remindersRepo';
import { getNotesForDigest }     from '../db/captureRepo';
import { supabaseHealthCheck } from '../db/client';
import { config }        from '../config';
import { logger }        from '../utils/logger';
import { NormalizedItem, Category, SourceType } from '../types';
import { Reminder }      from '../types/reminder';
import { CaptureNote }   from '../types/capture';
import { recordSourceSignal }  from '../db/sourceReputationRepo';
import { fillGapsWithSearch }  from './webSearch';

// ─── Timeout helper ────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[timeout] "${label}" exceeded ${ms / 1000}s — pipeline aborted`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

// ─── Reminders digest block ───────────────────────────────────────────────────

function fmtTime(r: Reminder): string {
  if (!r.due_at) return '';
  return new Date(r.due_at).toLocaleTimeString('ru-RU', {
    timeZone: r.timezone ?? 'Europe/Kyiv', hour: '2-digit', minute: '2-digit',
  });
}

async function buildRemindersBlock(tz: string): Promise<string | null> {
  const [{ today, tomorrow, overdue }, captureNotes] = await Promise.all([
    getRemindersForDigest(tz),
    getNotesForDigest(tz, 48).catch(() => [] as CaptureNote[]),
  ]);

  const hasReminders = today.length > 0 || tomorrow.length > 0 || overdue.length > 0;
  const hasCapture   = captureNotes.length > 0;
  if (!hasReminders && !hasCapture) return null;

  const lines: string[] = ['🗓 *ЛИЧНЫЕ ЗАДАЧИ И ИТОГИ*'];

  // ── Capture notes: call summaries & client notes ──────────────────────────
  if (hasCapture) {
    const callNotes = captureNotes.filter(
      (n) => n.type === 'call_summary' || n.type === 'client_notes'
    );

    if (callNotes.length > 0) {
      lines.push('\n📞 *Итоги звонков (48ч):*');
      for (const note of callNotes.slice(0, 5)) {
        lines.push(`• *${note.title}*`);
        const actions = (note.next_actions as string[]).slice(0, 2);
        if (actions.length) lines.push(`  → ${actions.join(' / ')}`);
      }
    }

    // Aggregated next actions from all capture notes
    const allActions = captureNotes
      .flatMap((n) => (n.next_actions as string[]).map((a) => `[${n.title}] ${a}`))
      .slice(0, 8);
    if (allActions.length > 0) {
      lines.push('\n🧩 *Следующие действия:*');
      allActions.forEach((a, i) => lines.push(`${i + 1}. ${a}`));
    }

    // Waiting items
    const allWaiting = captureNotes
      .flatMap((n) => n.waiting_items as string[])
      .slice(0, 5);
    if (allWaiting.length > 0) {
      lines.push('\n⏳ *Ждём ответа:*');
      allWaiting.forEach((w) => lines.push(`• ${w}`));
    }
  }

  // ── Reminders ─────────────────────────────────────────────────────────────
  if (hasReminders) {
    if (today.length > 0) {
      lines.push('\n📅 *Сегодня:*');
      for (const r of today) {
        const t = fmtTime(r);
        lines.push(`• ${t ? `${t} ` : ''}${r.normalized_title}`);
      }
    }
    if (tomorrow.length > 0) {
      lines.push('\n📅 *Завтра:*');
      for (const r of tomorrow) {
        lines.push(`• ${r.normalized_title}`);
      }
    }
    if (overdue.length > 0) {
      lines.push('\n⚠️ *Просрочено:*');
      for (const r of overdue) {
        lines.push(`• ${r.normalized_title}${r.due_date ? ` _(${r.due_date})_` : ''}`);
      }
    }

    // Simple recommendation
    const urgent = [...today, ...overdue].filter((r) => r.priority === 'urgent' || r.priority === 'high');
    if (urgent.length > 0) {
      lines.push(`\n💡 *Подготовиться:*\nВ первую очередь — ${urgent[0].normalized_title}`);
    } else if (overdue.length > 0) {
      lines.push(`\n💡 *Подготовиться:*\nЕсть просроченные задачи — разберись сегодня`);
    } else if (today.length > 0) {
      lines.push(`\n💡 *Подготовиться:*\nСначала — ${today[0].normalized_title}`);
    }
  }

  return lines.join('\n');
}

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

  // ── STEP 3: Supabase healthcheck ──────────────────────────────────────────
  logger.info('[digest] supabase healthcheck started');
  let dbOk: boolean;
  try {
    dbOk = await withTimeout(supabaseHealthCheck(), 20_000, 'supabase healthcheck');
  } catch (e) {
    logger.error('[digest] supabase healthcheck failed:', (e as Error).message);
    throw e;
  }
  if (!dbOk) {
    logger.error('[digest] supabase healthcheck failed — see [supabase-health] lines above');
    throw new Error('Supabase недоступен — проверь SUPABASE_URL и SUPABASE_SERVICE_KEY, а также наличие таблиц');
  }
  logger.info('[digest] supabase healthcheck ok');

  const since = new Date(Date.now() - config.lookbackHours * 3_600_000);

  // ── STEP 4: Collect (static + user-added adapters) ─────────────────────────
  logger.info('[digest] fetching sources started');
  const userAdapters = await withTimeout(loadUserAdapters(), 10_000, 'loadUserAdapters');
  const adapters     = [...allAdapters, ...userAdapters];
  logger.info(`[digest] adapters count=${adapters.length}`);

  const deepSince = new Date(Date.now() - 7 * 24 * 3_600_000);

  const rawItems: NormalizedItem[] = [];
  const fetchStart = Date.now();
  await withTimeout(
    Promise.allSettled(
      adapters.map(async (adapter) => {
        const t0 = Date.now();
        try {
          const adapterSince = isDeepSource(adapter.id) ? deepSince : since;
          // Per-adapter timeout: 30s each so one stuck feed can't block all
          const items = await withTimeout(
            adapter.fetch(adapterSince),
            30_000,
            `adapter.fetch(${adapter.id})`,
          );
          rawItems.push(...items);
          if (items.length > 0) {
            logger.info(`[pipeline] ${adapter.name}: ${items.length} (${Date.now() - t0}ms)`);
          }
        } catch (err) {
          logger.warn(`[pipeline] SKIP ${adapter.id} (${Date.now() - t0}ms): ${(err as Error).message}`);
        }
      })
    ),
    120_000,
    'all adapters fetch',
  );

  // ── STEP 5: fetching sources finished ──────────────────────────────────────
  logger.info(`[digest] fetching sources finished count=${rawItems.length} elapsed=${Date.now() - fetchStart}ms`);

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

  // ── STEP 6: Persist (upsert) ───────────────────────────────────────────────
  const seen = new Set<string>();
  const deduped_normalized = normalized.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });
  logger.info(`[digest] upsertItems started count=${deduped_normalized.length}`);
  try {
    await withTimeout(upsertItems(deduped_normalized), 30_000, 'upsertItems');
    logger.info('[digest] upsertItems finished');
  } catch (e) {
    logger.error('[digest] upsertItems failed:', (e as Error).message);
    throw e;
  }

  // 3b. Fill sparse categories with Tavily web search
  const grouped = new Map<Category, NormalizedItem[]>();
  for (const item of deduped_normalized) {
    const arr = grouped.get(item.category) ?? [];
    arr.push(item);
    grouped.set(item.category, arr);
  }
  const webItems = await withTimeout(fillGapsWithSearch(grouped), 60_000, 'fillGapsWithSearch');
  if (webItems.length > 0) {
    const webNormalized = normalizer.normalize(
      webItems.map((item) => ({
        source: item.source, sourceType: item.sourceType,
        title: item.title, content: item.content,
        url: item.url, timestamp: item.timestamp.toISOString(),
        category: item.category,
      }))
    );
    const webSeen = new Set<string>(deduped_normalized.map((i) => i.id));
    const webNew  = webNormalized.filter((i) => !webSeen.has(i.id));
    if (webNew.length > 0) {
      await withTimeout(upsertItems(webNew), 30_000, 'upsertItems(web)');
    }
    logger.info(`[pipeline] web search added: ${webNew.length} items`);
  }

  // 4. Load unsent — two windows: 36h for news, 7d for deep/slow categories
  const unsentNews  = await withTimeout(getUnsentItems(since, 80), 30_000, 'getUnsentItems(news)');
  const unsentDeep  = await withTimeout(getUnsentItems(deepSince, 40, DEEP_CATEGORIES), 30_000, 'getUnsentItems(deep)');
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
  const deduped = clustered.filter((i) => i.isPrimary !== false);
  logger.info(`[pipeline] after clustering: ${deduped.length} unique stories`);

  // 5. Rank — top 22 (wide pool, LLM filters to ≤12 bullets)
  await refreshInterestCache();
  const ranked = rankingService.rank(deduped);
  logger.info(`[pipeline] ranked top: ${ranked.length}`);

  // ── STEP 7: LLM summarization ──────────────────────────────────────────────
  logger.info('[digest] LLM summarization started');
  let messages: string[];
  try {
    messages = await withTimeout(generateBriefWithAgents(ranked), 180_000, 'generateBriefWithAgents');
    logger.info(`[digest] LLM summarization finished blocks=${messages.length}`);
  } catch (e) {
    logger.error('[digest] LLM summarization failed:', (e as Error).message);
    throw e;
  }

  // ── Prepend personal reminders block (non-fatal) ──────────────────────────
  try {
    const remBlock = await withTimeout(
      buildRemindersBlock(config.reminder.defaultTimezone),
      10_000,
      'buildRemindersBlock',
    );
    if (remBlock) {
      messages.unshift(remBlock);
      logger.info('[pipeline] reminders block added');
    }
  } catch (e) {
    logger.warn('[pipeline] reminders block skipped (non-fatal):', (e as Error).message);
  }

  // ── STEP 8: Send each message ──────────────────────────────────────────────
  logger.info(`[digest] telegram send started messages=${messages.length}`);
  try {
    for (const msg of messages) {
      await withTimeout(sendMessage(msg), 30_000, 'sendMessage');
    }
    logger.info('[digest] telegram send finished');
  } catch (e) {
    logger.error('[digest] telegram send failed:', (e as Error).message);
    throw e;
  }

  // ── STEP 9: Archive ────────────────────────────────────────────────────────
  const sentIds = ranked.map((i) => i.id);
  await withTimeout(markSent(sentIds), 15_000, 'markSent');
  await withTimeout(saveDigest(messages.join('\n\n─────────────────\n\n'), sentIds), 15_000, 'saveDigest');

  // Update source reputation
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
