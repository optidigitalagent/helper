import cron from 'node-cron';
import { runDigestPipeline } from '../services/digestPipeline';
import { config }            from '../config';
import { logger }            from '../utils/logger';

function nextRunHint(expr: string, tz: string): string {
  // node-cron parses "minute hour * * *" — extract hour:minute for display
  try {
    const parts = expr.trim().split(/\s+/);
    if (parts.length >= 2) {
      const [min, hour] = parts;
      if (!isNaN(Number(min)) && !isNaN(Number(hour))) {
        return `daily at ${String(Number(hour)).padStart(2, '0')}:${String(Number(min)).padStart(2, '0')} (${tz})`;
      }
    }
  } catch { /* ignore */ }
  return `cron="${expr}" tz=${tz}`;
}

export function startScheduler(): void {
  const expr = config.digestCron;
  const tz   = config.timezone;

  logger.info('[scheduler] DISABLED old schedules: 07:30, 11:00, 14:00, 17:30, 21:00 MSK');
  logger.info(`[startup] scheduler initialized — next digest: ${nextRunHint(expr, tz)}`);

  cron.schedule(expr, async () => {
    logger.info('[scheduler] running daily digest pipeline');
    try {
      await runDigestPipeline({ scheduled: true });
    } catch (err) {
      logger.error('[scheduler] pipeline error:', (err as Error).message ?? String(err));
    }
  }, { timezone: tz });
}
