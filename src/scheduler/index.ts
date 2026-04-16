import cron from 'node-cron';
import { runDigestPipeline } from '../services/digestPipeline';
import { config } from '../config';
import { logger } from '../utils/logger';

export function startScheduler(): void {
  logger.info(`[scheduler] digest cron: "${config.digestCron}"`);

  cron.schedule(config.digestCron, async () => {
    logger.info('[scheduler] cron triggered — running digest pipeline');
    try {
      await runDigestPipeline();
    } catch (err) {
      logger.error('[scheduler] pipeline error:', err);
    }
  });
}
