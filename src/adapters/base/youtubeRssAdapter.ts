/**
 * YouTube channels expose an RSS feed at:
 *   https://www.youtube.com/feeds/videos.xml?channel_id=<CHANNEL_ID>
 *
 * For handle-based URLs (@BiZSekrety etc.), you need to resolve the channel ID
 * once (use the YouTube Data API or look it up manually) and put it in config.
 */
import { createRssAdapter, RssAdapterConfig } from './rssAdapter';
import { SourceAdapter } from '../../types';

export function createYouTubeAdapter(
  cfg: Omit<RssAdapterConfig, 'feedUrl'> & { channelId: string }
): SourceAdapter {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${cfg.channelId}`;
  return createRssAdapter({ ...cfg, feedUrl });
}
