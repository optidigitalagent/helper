import cron from 'node-cron';
import { runDigestPipeline } from '../services/digestPipeline';
import { logger }            from '../utils/logger';

// 5 digest runs per day (Moscow time via TZ=Europe/Moscow in env)
const DIGEST_TIMES = '30 7,0 11,0 14,30 17,0 21 * * *';

export function startScheduler(): void {
  logger.info('[scheduler] digest schedule: 07:30, 11:00, 14:00, 17:30, 21:00 MSK');

  for (const expr of ['30 7 * * *', '0 11 * * *', '0 14 * * *', '30 17 * * *', '0 21 * * *']) {
    cron.schedule(expr, async () => {
      logger.info(`[scheduler] running digest pipeline (${expr})`);
      try {
        await runDigestPipeline();
      } catch (err) {
        logger.error('[scheduler] pipeline error:', (err as Error).message ?? String(err));
      }
    });
  }
}
