import TelegramBot from 'node-telegram-bot-api';
import { config }    from '../config';
import { logger }    from '../utils/logger';

// ─── Singleton bot instance ───────────────────────────────────────────────────
// Polling is started only when startBotPolling() is called (from index.ts).
// sendMessage() works in both modes.

let _bot: TelegramBot | null = null;

export function getBot(): TelegramBot {
  if (!_bot) {
    _bot = new TelegramBot(config.telegram.botToken, {
      // Long polling: one open connection waits up to 30s for updates.
      // Replaces the default 300ms short-poll loop — far fewer requests and logs.
      polling: { interval: 0, params: { timeout: 30 } },
    });
  }
  return _bot;
}

/** Start polling for incoming messages. Call once at app startup. */
export function startBotPolling(): void {
  getBot(); // bot is already configured with polling:true in constructor
  logger.info('[telegram] bot started (long-poll, timeout=30s)');
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
