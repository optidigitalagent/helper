import express from 'express';
import { runDigestPipeline } from './services/digestPipeline';
import { collectAll } from './services/collector';
import { logger } from './utils/logger';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Manually trigger a full digest run (useful for testing)
app.post('/digest/run', async (_req, res) => {
  logger.info('[api] manual digest run triggered');
  res.json({ status: 'started' });          // respond immediately
  runDigestPipeline().catch((err) =>
    logger.error('[api] digest error:', err)
  );
});

// Manually trigger just collection (without sending)
app.post('/collect', async (_req, res) => {
  const since = new Date(Date.now() - 24 * 3_600_000);
  logger.info('[api] manual collect triggered');
  res.json({ status: 'started' });
  collectAll(since).catch((err) =>
    logger.error('[api] collect error:', err)
  );
});

export default app;
