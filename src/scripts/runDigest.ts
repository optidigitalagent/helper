import 'dotenv/config';
import { runDigestPipeline } from '../services/digestPipeline';
import { logger } from '../utils/logger';

logger.info('[digest:run] manual digest started');
const _t0 = Date.now();

runDigestPipeline()
  .then(() => {
    logger.info(`[digest:run] finished successfully in ${((Date.now() - _t0) / 1000).toFixed(1)}s`);
    process.exit(0);
  })
  .catch((err) => {
    logger.error('[digest:run] FAILED:', (err as Error).message ?? String(err));
    process.exit(1);
  });
