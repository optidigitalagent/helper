import 'dotenv/config';
import { runDigestPipeline } from '../services/digestPipeline';
import { logger } from '../utils/logger';

runDigestPipeline()
  .then(() => {
    logger.info('[script] done');
    process.exit(0);
  })
  .catch((err) => {
    logger.error('[script] failed:', err);
    process.exit(1);
  });
