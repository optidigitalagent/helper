import TelegramBot from 'node-telegram-bot-api';
import { config }    from '../config';
import { logger }    from '../utils/logger';

// ─── Singleton bot instance ───────────────────────────────────────────────────

let _bot: TelegramBot | null = null;

export function getBot(): TelegramBot {
  if (!_bot) {
    // Create bot WITHOUT polling — we start it manually in startBotPolling()
    _bot = new TelegramBot(config.telegram.botToken, { polling: false });
  }
  return _bot;
}

/** Start polling. Auto-recovers from 409 by waiting for old session to expire. */
export async function startBotPolling(): Promise<void> {
  const bot = getBot();

  async function clearAndStart() {
    try { await (bot as any).deleteWebhook({ drop_pending_updates: true }); } catch { /* ignore */ }
    await bot.startPolling({ restart: false });
  }

  // Register handler BEFORE starting so no 409 is missed.
  let restarting = false;
  let attempt = 0;

  bot.on('polling_error', async (err) => {
    const msg = (err as Error).message ?? String(err);
    if (msg.includes('409')) {
      if (restarting) return;
      restarting = true;
      attempt++;
      const delay = Math.min(30_000 * attempt, 120_000); // 30s, 60s, 90s, max 120s
      logger.warn(`[telegram] 409 conflict — attempt ${attempt}, waiting ${delay / 1000}s...`);
      try { await bot.stopPolling(); } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, delay));
      try {
        await clearAndStart();
        logger.info('[telegram] polling restarted after 409 recovery');
        attempt = 0;
      } catch (e) {
        logger.error('[telegram] failed to restart after 409:', (e as Error).message);
      }
      restarting = false;
    } else {
      logger.warn('[telegram] polling_error:', msg.slice(0, 120));
    }
  });

  await clearAndStart();
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
