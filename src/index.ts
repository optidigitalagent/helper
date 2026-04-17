import 'dotenv/config';
import app from './app';
import { startScheduler } from './scheduler';
import { startBotPolling, getBot } from './services/telegram';
import { registerBotCommands } from './services/botCommands';
import { config } from './config';
import { logger } from './utils/logger';

const server = app.listen(config.port, () => {
  logger.info(`[server] listening on port ${config.port}`);
  startScheduler();
  // Register handlers before polling so no updates are missed
  registerBotCommands();
  startBotPolling().catch((err) => {
    logger.error('[server] bot polling failed to start:', (err as Error).message);
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Railway sends SIGTERM before killing the old container on redeploy.
// Stop polling immediately so the new instance doesn't get a 409 Conflict.

function shutdown(signal: string): void {
  logger.info(`[server] ${signal} received — stopping bot polling`);
  getBot().stopPolling()
    .then(() => {
      server.close(() => {
        logger.info('[server] exited cleanly');
        process.exit(0);
      });
    })
    .catch(() => process.exit(0));
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
