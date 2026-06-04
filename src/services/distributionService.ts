import TelegramBot from 'node-telegram-bot-api';
import fs           from 'fs';
import path         from 'path';
import { config }   from '../config';
import { logger }   from '../utils/logger';

const WHITELIST_FILE = path.resolve(process.cwd(), 'data', 'allowed_users.json');

interface WhitelistData {
  userIds: string[];
}

// ─── Whitelist persistence ────────────────────────────────────────────────────

function ensureDataDir(): void {
  const dir = path.dirname(WHITELIST_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function loadWhitelist(): string[] {
  try {
    if (fs.existsSync(WHITELIST_FILE)) {
      const data: WhitelistData = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
      return Array.isArray(data.userIds) ? data.userIds.map(String) : [];
    }
  } catch (err) {
    logger.warn('[distribution] whitelist read error:', (err as Error).message);
  }
  return config.distribution.allowedUserIds;
}

function saveWhitelist(userIds: string[]): void {
  ensureDataDir();
  fs.writeFileSync(WHITELIST_FILE, JSON.stringify({ userIds }, null, 2), 'utf-8');
}

/** Seeds whitelist file from env var on first run (file absent). */
export function initWhitelist(): void {
  if (!fs.existsSync(WHITELIST_FILE)) {
    const fromEnv = config.distribution.allowedUserIds;
    saveWhitelist(fromEnv);
    if (fromEnv.length > 0) {
      logger.info(`[distribution] whitelist seeded from env: ${fromEnv.length} user(s)`);
    } else {
      logger.info('[distribution] whitelist file created (empty). Use /distrib add <id> to add users.');
    }
  } else {
    const ids = loadWhitelist();
    logger.info(`[distribution] whitelist loaded: ${ids.length} user(s)`);
  }
}

export function addUserToWhitelist(userId: string): boolean {
  const ids = loadWhitelist();
  if (ids.includes(userId)) return false;
  saveWhitelist([...ids, userId]);
  logger.info(`[distribution] user ${userId} added to whitelist`);
  return true;
}

export function removeUserFromWhitelist(userId: string): boolean {
  const ids = loadWhitelist();
  const updated = ids.filter(id => id !== userId);
  if (updated.length === ids.length) return false;
  saveWhitelist(updated);
  logger.info(`[distribution] user ${userId} removed from whitelist`);
  return true;
}

// ─── Bot singleton (send-only, no polling) ───────────────────────────────────

let _distBot: TelegramBot | null = null;

function getDistBot(): TelegramBot | null {
  const token = config.distribution.botToken;
  if (!token) return null;
  if (!_distBot) {
    _distBot = new TelegramBot(token);
  }
  return _distBot;
}

// ─── Distribution ─────────────────────────────────────────────────────────────

/**
 * Sends already-generated messages to every user in the whitelist.
 * No LLM calls. Per-user failures are logged but do not stop the rest.
 */
export async function distributeMessages(messages: string[]): Promise<void> {
  const bot = getDistBot();
  if (!bot) {
    logger.warn('[distribution] TELEGRAM_DISTRIBUTION_BOT_TOKEN not set — distribution skipped');
    return;
  }

  const userIds = loadWhitelist();
  if (userIds.length === 0) {
    logger.info('[distribution] whitelist empty — distribution skipped');
    return;
  }

  logger.info(`[distribution] distributing ${messages.length} message(s) to ${userIds.length} user(s)`);
  let totalDelivered = 0;
  let totalFailed    = 0;

  for (const userId of userIds) {
    let delivered = 0;
    for (const msg of messages) {
      try {
        await bot.sendMessage(userId, msg, { parse_mode: 'Markdown' });
        delivered++;
      } catch (err) {
        const errMsg = (err as Error).message ?? '';
        // Markdown parse error → retry as plain text
        if (errMsg.includes('parse') || errMsg.includes('entities') || errMsg.includes('400')) {
          try {
            await bot.sendMessage(userId, msg);
            delivered++;
            logger.warn(`[distribution] user ${userId}: markdown failed, plain-text fallback used`);
          } catch (retryErr) {
            totalFailed++;
            logger.error(`[distribution] user ${userId}: failed (plain): ${(retryErr as Error).message}`);
          }
        } else {
          totalFailed++;
          logger.error(`[distribution] user ${userId}: failed: ${errMsg}`);
        }
      }
    }
    logger.info(`[distribution] user ${userId}: ${delivered}/${messages.length} delivered`);
    totalDelivered += delivered;
  }

  logger.info(`[distribution] complete — delivered=${totalDelivered} failed=${totalFailed}`);
}
