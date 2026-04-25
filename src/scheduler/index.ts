import cron from 'node-cron';
import { runDigestPipeline } from '../services/digestPipeline';
import { config }            from '../config';
import { logger }            from '../utils/logger';

export function startScheduler(): void {
  const expr = config.digestCron;
  const tz   = config.timezone;

  logger.info('[scheduler] DISABLED old schedules: 07:30, 11:00, 14:00, 17:30, 21:00 MSK');
  logger.info(`[scheduler] ONE daily digest enabled: "${expr}" timezone=${tz}`);

  cron.schedule(expr, async () => {
    logger.info('[scheduler] running daily digest pipeline');
    try {
      await runDigestPipeline({ scheduled: true });
    } catch (err) {
      logger.error('[scheduler] pipeline error:', (err as Error).message ?? String(err));
    }
  }, { timezone: tz });
}
