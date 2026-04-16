import 'dotenv/config';
import app from './app';
import { startScheduler } from './scheduler';
import { startBotPolling } from './services/telegram';
import { registerBotCommands } from './services/botCommands';
import { config } from './config';
import { logger } from './utils/logger';

app.listen(config.port, () => {
  logger.info(`[server] listening on port ${config.port}`);
  startScheduler();
  startBotPolling();
  registerBotCommands();
});
