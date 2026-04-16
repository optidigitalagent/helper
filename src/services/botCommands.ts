import TelegramBot from 'node-telegram-bot-api';
import { getBot }            from './telegram';
import { runDigestPipeline } from './digestPipeline';
import { getSourceStats, getLastDigest, saveManualItem } from '../db/itemsRepo';
import { saveUserSource, listUserSources, deleteUserSource, addInterestKeywords } from '../db/userSourcesRepo';
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

  // Plain message containing a URL (no command) — auto-add
  bot.on('message', async (msg) => {
    if (!isAuthorized(msg.chat.id)) return;
    const text = msg.text ?? '';
    // Skip if it's a command
    if (text.startsWith('/')) return;
    const urlMatch = text.match(URL_REGEX);
    if (!urlMatch) return;
    // Extract note = everything except the URL
    const url  = urlMatch[0];
    const note = text.replace(url, '').trim();
    await handleAdd(bot, msg.chat.id, url, note);
  });

  bot.on('polling_error', (err) => {
    const msg = (err as Error).message ?? String(err);
    // 409 = old instance still running, will stop in seconds via SIGTERM handler.
    // Just log once and let node-telegram-bot-api retry automatically — don't stop polling.
    throttledError('[telegram] polling error', msg.slice(0, 120));
  });

  logger.info('[botCommands] commands registered');
}
