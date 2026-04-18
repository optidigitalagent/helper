import TelegramBot from 'node-telegram-bot-api';
import { config }    from '../config';
import { logger }    from '../utils/logger';

// ─── Singleton bot instance ───────────────────────────────────────────────────

let _bot: TelegramBot | null = null;

export function getBot(): TelegramBot {
  if (!_bot) {
    _bot = new TelegramBot(config.telegram.botToken, {
      polling: {
        autoStart: false,
        interval:  2000,          // 2s gap between retries on error (e.g. 409)
        params:    { timeout: 30 }, // long-poll: wait up to 30s for updates
      },
    });
  }
  return _bot;
}

/** Start polling. On 409 conflict the library retries every 2s until the old session expires. */
export async function startBotPolling(): Promise<void> {
  const bot = getBot();

  let last409 = 0;
  bot.on('polling_error', (err) => {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes('409')) {
      // Another instance is still running — library retries automatically every 2s.
      // Log at most once per 30s to avoid spam.
      const now = Date.now();
      if (now - last409 > 30_000) {
        logger.warn('[telegram] 409 conflict — waiting for other instance to release polling...');
        last409 = now;
      }
    } else {
      logger.warn('[telegram] polling error:', msg.slice(0, 120));
    }
  });

  await bot.startPolling();
  logger.info('[telegram] bot polling started');
}

// ─── Sending ──────────────────────────────────────────────────────────────────

const MAX_LENGTH = 4096;

function splitMessage(text: string): string[] {
  if (text.length <= MAX_LENGTH) return [text];
  const chunks: string[] = [];
  let current = '';
  for (const block of text.split('\n\n')) {
    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length <= MAX_LENGTH) {
      current = candidate;
    } else {
      if (current) chunks.push(current);
      current = block.slice(0, MAX_LENGTH);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendMessage(text: string): Promise<void> {
  const bot    = getBot();
  const chunks = splitMessage(text);
  for (const chunk of chunks) {
    await bot.sendMessage(config.telegram.chatId, chunk, { parse_mode: 'Markdown' });
  }
  logger.info(`[telegram] sent ${chunks.length} message(s)`);
}
