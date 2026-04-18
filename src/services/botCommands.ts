import TelegramBot from 'node-telegram-bot-api';
import { getBot }            from './telegram';
import { runDigestPipeline } from './digestPipeline';
import { getSourceStats, getLastDigest, saveManualItem } from '../db/itemsRepo';
import { saveUserSource, listUserSources, deleteUserSource, addInterestKeywords } from '../db/userSourcesRepo';
import { saveAnalysis, saveDiscoveredEntities, ingestAnalysisForDigest, listAnalyzedLinks, listDiscoveredEntities } from '../db/knowledgeRepo';
import { analyzeUrl, LinkAnalysis } from './linkAnalyzer';
import { recordSourceSignal, listSourceReputations, setSourceStatus, SourceStatus } from '../db/sourceReputationRepo';
import { searchWeb }                    from './webSearch';
import { handleIntentQuery, isIntentQuery, explainTopic, chatReply, clearHistory, addToHistory } from './intentService';
import { runPushScan }                  from './pushMonitor';
import { discoverFeed, extractKeywords } from './sourceDiscovery';
import { SOURCE_GOVERNANCE } from './sourceGovernance';
import { logger, throttledError } from '../utils/logger';
import { config }            from '../config';
import { Category }          from '../types';

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Only the configured chat ID can issue commands

function isAuthorized(chatId: number): boolean {
  return String(chatId) === String(config.telegram.chatId);
}

function reply(bot: TelegramBot, chatId: number, text: string): Promise<TelegramBot.Message> {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

// ─── /brief ───────────────────────────────────────────────────────────────────

async function handleBrief(bot: TelegramBot, chatId: number): Promise<void> {
  await reply(bot, chatId, '⏳ Запускаю дайджест...').catch(() => {});
  try {
    await runDigestPipeline();
  } catch (err) {
    const msg = ((err as Error).message ?? 'Unknown error').slice(0, 300);
    logger.error('[botCommands] /brief error:', msg);
    // Plain text — no parse_mode, avoids Telegram 400 on special chars in error messages
    await bot.sendMessage(chatId, `❌ Ошибка: ${msg}`).catch(() => {});
  }
}

// ─── /status ──────────────────────────────────────────────────────────────────

async function handleStatus(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    const last = await getLastDigest();
    if (!last) {
      await reply(bot, chatId, '📭 Дайджестов ещё не было.');
      return;
    }
    const when = new Date(last.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
    const preview = last.markdown.split('\n').slice(0, 3).join('\n');
    await reply(bot, chatId, `📋 *Последний дайджест*\n🕐 ${when}\n\n${preview}\n\n_/brief — запустить новый_`);
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /sources ─────────────────────────────────────────────────────────────────

async function handleSources(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    const stats = await getSourceStats(7);
    if (stats.length === 0) {
      await reply(bot, chatId, '📭 Нет данных за 7 дней.');
      return;
    }

    const lines = stats.slice(0, 20).map((s) => {
      const meta   = SOURCE_GOVERNANCE[s.sourceId];
      const tier   = meta?.priorityTier ?? '?';
      const noisy  = meta?.noisy ? ' 🔇' : '';
      const pct    = s.total > 0 ? Math.round((s.sent / s.total) * 100) : 0;
      return `• \`${s.sourceId}\` [${tier}${noisy}] — ${s.sent}/${s.total} (${pct}%)`;
    });

    await reply(
      bot,
      chatId,
      `📊 *Источники за 7 дней* (sent/total)\n\n${lines.join('\n')}`,
    );
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /skip ────────────────────────────────────────────────────────────────────
// In-memory skip list: mutes a source for the current process lifetime

const SKIP_LIST = new Set<string>();

export function isSkipped(sourceId: string): boolean {
  return SKIP_LIST.has(sourceId);
}

async function handleSkip(bot: TelegramBot, chatId: number, sourceId: string | undefined): Promise<void> {
  if (!sourceId) {
    if (SKIP_LIST.size === 0) {
      await reply(bot, chatId, '📋 Skip-лист пуст.\n_/skip <source\\_id>_ — замьютить источник');
    } else {
      const list = [...SKIP_LIST].map((s) => `• \`${s}\``).join('\n');
      await reply(bot, chatId, `🔕 *Сейчас в skip-листе:*\n${list}\n\n_/unskip <source\\_id>_ — снять`);
    }
    return;
  }

  if (SKIP_LIST.has(sourceId)) {
    await reply(bot, chatId, `ℹ️ \`${sourceId}\` уже в skip-листе`);
    return;
  }

  SKIP_LIST.add(sourceId);
  logger.info(`[botCommands] skipping source: ${sourceId}`);
  await reply(bot, chatId, `🔕 \`${sourceId}\` замьючен до перезапуска`);
}

// ─── /unskip ──────────────────────────────────────────────────────────────────

async function handleUnskip(bot: TelegramBot, chatId: number, sourceId: string | undefined): Promise<void> {
  if (!sourceId) {
    await reply(bot, chatId, '_/unskip <source\\_id>_ — снять с мьюта');
    return;
  }
  if (!SKIP_LIST.has(sourceId)) {
    await reply(bot, chatId, `ℹ️ \`${sourceId}\` не в skip-листе`);
    return;
  }
  SKIP_LIST.delete(sourceId);
  await reply(bot, chatId, `🔈 \`${sourceId}\` снят с мьюта`);
}

// ─── /add + plain URL handler ────────────────────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s]+/;

async function handleAdd(bot: TelegramBot, chatId: number, url: string, note: string): Promise<void> {
  if (!URL_REGEX.test(url)) {
    await reply(bot, chatId, '❌ Нет URL. Пример: `/add https://... заметка`');
    return;
  }
  try {
    await saveManualItem(url, note);
    logger.info(`[botCommands] manual item saved: ${url}`);

    // Learn from what the user is adding
    const keywords = extractKeywords(`${note} ${url}`);
    if (keywords.length > 0) {
      await addInterestKeywords(keywords).catch(() => {}); // non-blocking
    }

    await reply(bot, chatId, `✅ Добавлено в следующий дайджест\n\`${url}\`${note ? `\n_${note}_` : ''}`);
  } catch (err) {
    const e = err as Error;
    logger.error('[botCommands] handleAdd error stack:', e.stack ?? e.message);
    await reply(bot, chatId, `❌ ${e.message}`);
  }
}

// ─── /learn ───────────────────────────────────────────────────────────────────

async function handleLearn(bot: TelegramBot, chatId: number, url: string | undefined): Promise<void> {
  if (!url) {
    // Show current user sources
    const sources = await listUserSources().catch(() => []);
    if (sources.length === 0) {
      await reply(bot, chatId,
        '📭 Нет добавленных источников.\n\n_/learn <url> — добавить любой сайт/блог/подкаст_');
      return;
    }
    const lines = sources.map((s) => `• ${s.name}\n  \`${s.feedUrl}\``).join('\n');
    await reply(bot, chatId, `📡 *Твои источники (${sources.length}):*\n\n${lines}\n\n_/forget <url> — удалить_`);
    return;
  }

  await reply(bot, chatId, `🔍 Ищу RSS для \`${url}\`...`);

  try {
    const result = await discoverFeed(url);

    if (!result) {
      await reply(bot, chatId,
        `❌ RSS не найден для \`${url}\`\n\n` +
        `Попробуй:\n` +
        `• Указать прямую ссылку на RSS/Atom\n` +
        `• Найти ссылку на фид вручную на сайте`
      );
      return;
    }

    await saveUserSource(result.siteName, result.feedUrl, Category.AI);
    logger.info(`[botCommands] user source added: ${result.feedUrl}`);

    await reply(bot, chatId,
      `✅ *Источник добавлен:* ${result.siteName}\n` +
      `📡 \`${result.feedUrl}\`\n\n` +
      `_Появится в следующем дайджесте_`
    );
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /forget ──────────────────────────────────────────────────────────────────

async function handleForget(bot: TelegramBot, chatId: number, url: string | undefined): Promise<void> {
  if (!url) {
    await reply(bot, chatId, '_/forget <feed\\_url> — удалить источник_');
    return;
  }
  try {
    await deleteUserSource(url);
    await reply(bot, chatId, `🗑 Источник удалён: \`${url}\``);
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /analyze ─────────────────────────────────────────────────────────────────

const VERDICT_EMOJI: Record<string, string> = {
  must_watch:     '🔥 MUST WATCH',
  worth_watching: '✅ Стоит посмотреть',
  can_skip:       '⚠️ Можно пропустить',
  skip:           '🔴 Пропусти',
};

async function handleAnalyze(bot: TelegramBot, chatId: number, url: string | undefined): Promise<void> {
  if (!url) {
    await reply(bot, chatId, '_/analyze <url> — умный анализ: стоит ли смотреть и нужно ли следить за источником_');
    return;
  }

  const thinking = await reply(bot, chatId, `🔍 Анализирую...`).catch(() => undefined);

  try {
    const analysis = await analyzeUrl(url);

    // DB saves are non-critical — never let them break the user-facing response
    saveAnalysis(analysis).catch((e) => logger.warn('[analyze] saveAnalysis:', e.message));
    saveDiscoveredEntities(analysis.discovered_entities, url).catch(() => {});

    const domain = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } })();
    recordSourceSignal(
      `user_${domain}`, analysis.source_name, url,
      analysis.quality_score, 'user_submit',
    ).catch(() => {});

    // User manually submitted → always save, minimum score 55
    const score   = Math.max(analysis.quality_score, 55);
    const verdict = VERDICT_EMOJI[analysis.verdict] ?? '✅ Стоит посмотреть';
    const scoreBar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));

    await ingestAnalysisForDigest({ ...analysis, quality_score: score, should_save: true }).catch(() => {});

    const lines: string[] = [
      `${verdict}`,
      ``,
      `*${analysis.title}*`,
      `_${analysis.source_name}_ · ${analysis.content_type}`,
      ``,
      `📝 ${analysis.summary}`,
    ];

    if (analysis.why_it_matters) lines.push(``, `⚡️ ${analysis.why_it_matters}`);
    if (analysis.practical_value) lines.push(`🛠 ${analysis.practical_value}`);

    lines.push(``, `${scoreBar} ${score}/100`);
    lines.push(`_→ добавлено в следующий дайджест_`);

    // Source tracking suggestion
    if (analysis.should_track_source) {
      lines.push(``, `📡 *Источник стоит отслеживать*`);
      lines.push(`/learn ${url}`);
    }

    // Similar sources
    if (analysis.similar_sources.length > 0) {
      lines.push(``, `🔍 *Похожие источники:*`);
      for (const s of analysis.similar_sources.slice(0, 3)) {
        lines.push(`• *${s.name}* — ${s.why}`);
        lines.push(`  /learn ${s.url}`);
      }
    }

    const text = lines.filter(Boolean).join('\n');
    if (thinking) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: thinking.message_id, parse_mode: 'Markdown' }).catch(async () => {
        await reply(bot, chatId, text);
      });
    } else {
      await reply(bot, chatId, text);
    }
  } catch (err) {
    const msg = ((err as Error).message ?? 'Unknown error').slice(0, 300);
    logger.error('[botCommands] /analyze error:', msg);
    await bot.sendMessage(chatId, `❌ ${msg}`).catch(() => {});
  }
}

// ─── /search ─────────────────────────────────────────────────────────────────

async function handleSearch(bot: TelegramBot, chatId: number, query: string | undefined): Promise<void> {
  if (!query) {
    await reply(bot, chatId, '_/search <запрос> — найти в интернете через Tavily_');
    return;
  }
  const msg = await reply(bot, chatId, `🔍 Ищу: _${query}_...`).catch(() => undefined);
  try {
    const items = await searchWeb(query, 5);
    if (items.length === 0) {
      // No web results — explain from model knowledge
      const explanation = await explainTopic(query).catch(() => null);
      const text = explanation
        ? `🧠 *${query}*\n\n${explanation}`
        : `📭 По запросу "${query}" ничего не нашлось. Попробуй уточнить.`;
      if (msg) {
        await bot.editMessageText(text, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }).catch(async () => reply(bot, chatId, text));
      } else {
        await reply(bot, chatId, text);
      }
      return;
    }
    const lines = items.map((i) =>
      `• [${i.title.slice(0, 80)}](${i.url})\n  _${i.content.slice(0, 120).replace(/\n/g, ' ')}_`
    );
    const text = `🔎 *Результаты: "${query}"*\n\n${lines.join('\n\n')}`;
    if (msg) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'Markdown' }).catch(async () => reply(bot, chatId, text));
    } else {
      await reply(bot, chatId, text);
    }
  } catch (err) {
    await bot.sendMessage(chatId, `❌ ${(err as Error).message}`).catch(() => {});
  }
}

// ─── /tracked ────────────────────────────────────────────────────────────────

async function handleTracked(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    const trusted   = await listSourceReputations('trusted', 5);
    const tracked   = await listSourceReputations('tracked', 10);
    const candidate = await listSourceReputations('candidate', 8);

    const fmt = (r: Awaited<ReturnType<typeof listSourceReputations>>[0]) => {
      const bar = '█'.repeat(Math.round(r.avgQuality / 10)) + '░'.repeat(10 - Math.round(r.avgQuality / 10));
      return `• *${r.sourceName}* ${bar} ${r.avgQuality}/100 (×${r.signalCount})`;
    };

    const sections: string[] = [];
    if (trusted.length)    sections.push(`🏆 *Trusted (${trusted.length}):*\n${trusted.map(fmt).join('\n')}`);
    if (tracked.length)    sections.push(`📡 *Tracked (${tracked.length}):*\n${tracked.map(fmt).join('\n')}`);
    if (candidate.length)  sections.push(`🔭 *Candidates (${candidate.length}):*\n${candidate.map(fmt).join('\n')}`);

    if (sections.length === 0) {
      await reply(bot, chatId, '📭 Нет отслеживаемых источников.\n\n_/analyze <url> — начать анализировать ссылки_');
      return;
    }

    await reply(bot, chatId, sections.join('\n\n'));
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /knowledge ───────────────────────────────────────────────────────────────

async function handleKnowledge(bot: TelegramBot, chatId: number): Promise<void> {
  try {
    const links = await listAnalyzedLinks(10);
    if (links.length === 0) {
      await reply(bot, chatId, '📭 Нет проанализированных ссылок.\n\n_/analyze <url> — добавить_');
      return;
    }
    const lines = links.map((l) => {
      const score = l.quality_score;
      const e = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
      const saved = l.should_save ? ' ✅' : '';
      return `${e} [${l.title.slice(0, 60)}](${l.url})${saved}\n_${l.knowledge_type} · ${score}/100_`;
    });
    await reply(bot, chatId, `📚 *Последние анализы:*\n\n${lines.join('\n\n')}`);
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /entities ────────────────────────────────────────────────────────────────

async function handleEntities(bot: TelegramBot, chatId: number, typeFilter?: string): Promise<void> {
  try {
    const validTypes = ['tool', 'person', 'channel', 'source', 'company'] as const;
    type EntityType = typeof validTypes[number];
    const t = validTypes.find((v) => v === typeFilter) as EntityType | undefined;
    const entities = await listDiscoveredEntities(t, 20);
    if (entities.length === 0) {
      await reply(bot, chatId, '📭 Нет данных.\n\n_/analyze <url> — анализировать ссылку_');
      return;
    }
    const byType = new Map<string, typeof entities>();
    for (const e of entities) {
      const arr = byType.get(e.entity_type) ?? [];
      arr.push(e);
      byType.set(e.entity_type, arr);
    }
    const sections: string[] = [];
    for (const [type, list] of byType) {
      const items = list.map((e) => `• ${e.url ? `[${e.name}](${e.url})` : e.name}${e.notes ? ` — _${e.notes}_` : ''}`);
      sections.push(`*${type.toUpperCase()}*\n${items.join('\n')}`);
    }
    await reply(bot, chatId, `🔎 *Обнаруженные объекты*\n\n${sections.join('\n\n')}`);
  } catch (err) {
    await reply(bot, chatId, `❌ ${(err as Error).message}`);
  }
}

// ─── /help ────────────────────────────────────────────────────────────────────

async function handleHelp(bot: TelegramBot, chatId: number): Promise<void> {
  await reply(bot, chatId,
    `*Команды*\n\n` +
    `📰 *Дайджест*\n` +
    `/brief — запустить сейчас\n` +
    `/status — последний дайджест\n\n` +
    `🔗 *Ссылки*\n` +
    `/add <url> [заметка] — добавить в следующий дайджест\n` +
    `_Или просто скинь ссылку — поймаю автоматически_\n\n` +
    `💬 *Просто напиши*\n` +
    `_"хочу идеи"_ / _"хочу понять AI agents"_ / _"хочу посмотреть по бизнесу"_\n` +
    `→ система поймёт что нужно и подберёт лучший формат\n\n` +
    `🌐 *Поиск*\n` +
    `/search <запрос> — поиск в интернете через Tavily\n` +
    `/push — проверить свежие сильные материалы прямо сейчас\n\n` +
    `🧠 *Анализ и обучение*\n` +
    `/analyze <url> — разбор: стоит смотреть? нужно следить за источником?\n` +
    `/tracked — источники по репутации (trusted/tracked/candidate)\n` +
    `/knowledge — последние проанализированные ссылки\n` +
    `/entities [tool|person|channel] — обнаруженные объекты\n\n` +
    `📡 *Источники*\n` +
    `/learn <url> — найти RSS и добавить источник навсегда\n` +
    `/learn — список твоих источников\n` +
    `/forget <feed\\_url> — удалить источник\n` +
    `/sources — статистика всех источников\n` +
    `/skip <id> — замьютить источник\n` +
    `/unskip <id> — снять мьют`,
  );
}

// ─── Register all handlers ───────────────────────────────────────────────────

export function registerBotCommands(): void {
  const bot = getBot();

  // /clear — reset conversation history
  bot.onText(/^\/clear(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    clearHistory(msg.chat.id);
    await reply(bot, msg.chat.id, '🗑 История чата очищена');
  });

  // /debug — test LLM connection
  bot.onText(/^\/debug(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await bot.sendMessage(msg.chat.id, '🔧 Тестирую подключение...').catch(() => {});
    try {
      const response = await chatReply('скажи "работает"');
      await bot.sendMessage(msg.chat.id, `✅ LLM ответил: ${response.slice(0, 200)}`).catch(() => {});
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ LLM ошибка: ${(err as Error).message.slice(0, 300)}`).catch(() => {});
    }
  });

  // /id — debug: show current chat ID and auth status
  bot.onText(/^\/id(@\w+)?$/, async (msg) => {
    const authorized = isAuthorized(msg.chat.id);
    await bot.sendMessage(msg.chat.id,
      `Chat ID: \`${msg.chat.id}\`\nUser ID: \`${msg.from?.id ?? 'unknown'}\`\nAuthorized: ${authorized ? '✅' : '❌'}\nConfigured CHAT_ID: \`${config.telegram.chatId}\``
    , { parse_mode: 'Markdown' }).catch(() => {});
  });

  bot.onText(/^\/brief(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleBrief(bot, msg.chat.id);
  });

  bot.onText(/^\/status(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleStatus(bot, msg.chat.id);
  });

  bot.onText(/^\/sources(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleSources(bot, msg.chat.id);
  });

  bot.onText(/^\/skip(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleSkip(bot, msg.chat.id, match?.[2]);
  });

  bot.onText(/^\/unskip(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleUnskip(bot, msg.chat.id, match?.[2]);
  });

  bot.onText(/^\/help(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleHelp(bot, msg.chat.id);
  });

  // /learn [url]
  bot.onText(/^\/learn(@\w+)?(?:\s+(https?:\/\/\S+))?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleLearn(bot, msg.chat.id, match?.[2]);
  });

  // /forget <url>
  bot.onText(/^\/forget(@\w+)?\s+(\S+)$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleForget(bot, msg.chat.id, match?.[2]);
  });

  // /add <url> [note]
  bot.onText(/^\/add(@\w+)?\s+(https?:\/\/\S+)(.*)?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    const url  = match?.[2] ?? '';
    const note = (match?.[3] ?? '').trim();
    await handleAdd(bot, msg.chat.id, url, note);
  });

  // Plain message: URL → auto-add, intent text → pull mode, other → chat
  bot.on('message', async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const text = msg.text ?? '';
    if (text.startsWith('/')) return;
    logger.info(`[botCommands] message received: "${text.slice(0, 60)}" isIntent=${isIntentQuery(text)}`);

    const urlMatch = text.match(URL_REGEX);
    if (urlMatch) {
      const url  = urlMatch[0];
      const note = text.replace(url, '').trim();
      await handleAdd(bot, msg.chat.id, url, note);
      return;
    }

    // PULL MODE: intent-based query (search + recommendations)
    if (isIntentQuery(text)) {
      const thinking = await reply(bot, msg.chat.id, '🤔 Ищу...').catch(() => undefined);
      try {
        addToHistory(msg.chat.id, 'user', text);
        const response = await handleIntentQuery(text);
        const safeResponse = response?.trim() || '🤷 Ничего не нашёл. Попробуй /search или задай вопрос иначе.';
        if (safeResponse) addToHistory(msg.chat.id, 'assistant', safeResponse);
        const sendSafe = async (t: string) => {
          await bot.sendMessage(msg.chat.id, t, { parse_mode: 'Markdown' }).catch(async () =>
            bot.sendMessage(msg.chat.id, t).catch(() => {}),
          );
        };
        if (thinking) {
          await bot.editMessageText(safeResponse, {
            chat_id: msg.chat.id, message_id: thinking.message_id, parse_mode: 'Markdown',
          }).catch(async () => sendSafe(safeResponse));
        } else {
          await sendSafe(safeResponse);
        }
      } catch (err) {
        await bot.sendMessage(msg.chat.id, `❌ ${(err as Error).message.slice(0, 200)}`).catch(() => {});
      }
      return;
    }

    // CHAT MODE: any other text — simple direct LLM reply
    const thinking = await reply(bot, msg.chat.id, '💬').catch(() => undefined);
    try {
      const response = await chatReply(text, msg.chat.id);
      const safeResponse = response?.trim() || '🤷 Не смог ответить. Попробуй ещё раз.';
      const sendSafe = async (text: string) => {
        await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }).catch(async () =>
          bot.sendMessage(msg.chat.id, text).catch(() => {}),
        );
      };
      if (thinking) {
        await bot.editMessageText(safeResponse, {
          chat_id: msg.chat.id, message_id: thinking.message_id, parse_mode: 'Markdown',
        }).catch(async () => sendSafe(safeResponse));
      } else {
        await sendSafe(safeResponse);
      }
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ ${(err as Error).message.slice(0, 200)}`).catch(() => {});
    }
  });

  // /push — manual trigger push scan
  bot.onText(/^\/push(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await reply(bot, msg.chat.id, '🔍 Сканирую свежие сильные материалы...').catch(() => {});
    try {
      await runPushScan();
    } catch (err) {
      await reply(bot, msg.chat.id, `❌ ${(err as Error).message}`);
    }
  });

  // /analyze <url>
  bot.onText(/^\/analyze(@\w+)?(?:\s+(https?:\/\/\S+))?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleAnalyze(bot, msg.chat.id, match?.[2]);
  });

  // /search <query>
  bot.onText(/^\/search(@\w+)?(?:\s+(.+))?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleSearch(bot, msg.chat.id, match?.[2]?.trim());
  });

  // /tracked
  bot.onText(/^\/tracked(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleTracked(bot, msg.chat.id);
  });

  // /knowledge
  bot.onText(/^\/knowledge(@\w+)?$/, async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleKnowledge(bot, msg.chat.id);
  });

  // /entities [type]
  bot.onText(/^\/entities(@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    if (!isAuthorized(msg.chat.id)) return;
    await handleEntities(bot, msg.chat.id, match?.[2]);
  });

  logger.info('[botCommands] commands registered');
}
