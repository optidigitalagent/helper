import cron from 'node-cron';
import { runDigestPipeline } from '../services/digestPipeline';
import { runPushScan }       from '../services/pushMonitor';
import { config }            from '../config';
import { logger }            from '../utils/logger';

// Push scan runs every 4 hours (except at 7:00 when the full digest runs)
const PUSH_CRON = '0 3,11,15,19,23 * * *';

export function startScheduler(): void {
  logger.info(`[scheduler] digest cron: "${config.digestCron}"`);
  logger.info(`[scheduler] push cron:   "${PUSH_CRON}"`);

  cron.schedule(config.digestCron, async () => {
    logger.info('[scheduler] running digest pipeline');
    try {
      await runDigestPipeline();
    } catch (err) {
      logger.error('[scheduler] pipeline error:', (err as Error).message ?? String(err));
    }
  });

  cron.schedule(PUSH_CRON, async () => {
    logger.info('[scheduler] running push scan');
    try {
      await runPushScan();
    } catch (err) {
      logger.error('[scheduler] push scan error:', (err as Error).message ?? String(err));
    }
  });
}
