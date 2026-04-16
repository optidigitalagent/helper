/**
 * Telegram public channels expose an RSS feed at:
 *   https://rsshub.app/telegram/channel/<username>
 *
 * This adapter wraps the generic RSS adapter for Telegram channels.
 * If you self-host RSSHub, set RSSHUB_BASE_URL in .env.
 */
import { createRssAdapter, RssAdapterConfig } from './rssAdapter';
import { SourceAdapter } from '../../types';

const RSSHUB_BASE = process.env.RSSHUB_BASE_URL ?? 'https://rsshub.app';

export function createTelegramAdapter(
  cfg: Omit<RssAdapterConfig, 'feedUrl'> & { channelUsername: string }
): SourceAdapter {
  const feedUrl = `${RSSHUB_BASE}/telegram/channel/${cfg.channelUsername}`;
  return createRssAdapter({ ...cfg, feedUrl });
}
