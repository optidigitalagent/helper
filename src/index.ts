import 'dotenv/config';
import app from './app';
import { startScheduler } from './scheduler';
import { startBotPolling, getBot } from './services/telegram';
import { registerBotCommands } from './services/botCommands';
import { startReminderBot, stopReminderBot } from './services/reminderBot';
import { initWhitelist } from './services/distributionService';
import { supabaseHealthCheck } from './db/client';
import { config } from './config';
import { logger } from './utils/logger';

// ── Startup health-check ──────────────────────────────────────────────────────
// If required env vars were missing, config import above already threw — so
// reaching this line means SUPABASE + TELEGRAM are loaded correctly.
const _OPTIONAL_CHECK = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'TAVILY_API_KEY'];
const _missingOptional = _OPTIONAL_CHECK.filter((k) => !process.env[k]);

logger.info(`[startup] helper-agent started | node ${process.version} | pid ${process.pid}`);
logger.info('[startup] env OK — SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID all set');
if (_missingOptional.length) {
  logger.info(`[startup] optional vars not set (non-fatal): ${_missingOptional.join(', ')}`);
}
logger.info(`[startup] LLM provider: ${process.env.LLM_PROVIDER ?? 'openai (default)'} | digest cron: "${config.digestCron}" | tz: ${config.timezone}`);
// ─────────────────────────────────────────────────────────────────────────────

const server = app.listen(config.port, () => {
  logger.info(`[server] listening on port ${config.port}`);

  // Non-fatal Supabase health-check — logs detailed diagnostics, does NOT stop the server
  supabaseHealthCheck()
    .then((ok) => {
      if (!ok) logger.warn('[startup] Supabase health-check FAILED — digest pipeline will not work until this is fixed');
    })
    .catch((err) => logger.error('[startup] supabaseHealthCheck threw:', (err as Error).message));

  initWhitelist();
  startScheduler();
  // Register handlers before polling so no updates are missed
  registerBotCommands();
  startBotPolling()
    .then(() => logger.info('[startup] telegram bot initialized'))
    .catch((err) => {
      logger.error('[startup] telegram bot FAILED to initialize:', (err as Error).message);
    });
  startReminderBot()
    .then(() => logger.info('[startup] reminder bot initialized'))
    .catch((err) => {
      logger.warn('[startup] reminder bot FAILED to initialize (non-fatal):', (err as Error).message);
    });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Railway sends SIGTERM before killing the old container on redeploy.
// Stop polling immediately so the new instance doesn't get a 409 Conflict.

function shutdown(signal: string): void {
  logger.info(`[server] ${signal} received — stopping bots`);
  Promise.allSettled([
    getBot().stopPolling(),
    stopReminderBot(),
  ]).then(() => {
    server.close(() => {
      logger.info('[server] exited cleanly');
      process.exit(0);
    });
  }).catch(() => process.exit(0));
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Prevent unhandled promise rejections from crashing the process
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error
    ? reason.message
    : typeof reason === 'string' ? reason : 'unknown rejection';
  logger.error('[process] unhandledRejection:', msg.slice(0, 200));
});
process.on('uncaughtException', (err) => {
  logger.error('[process] uncaughtException:', (err.message ?? 'unknown').slice(0, 200));
});
