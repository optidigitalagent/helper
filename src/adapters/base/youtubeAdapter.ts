import { createRssAdapter, RssAdapterConfig } from './rssAdapter';
import { SourceAdapter, SourceType } from '../../types';

export function createYoutubeAdapter(
  cfg: Omit<RssAdapterConfig, 'feedUrl' | 'sourceType'> & { channelId: string },
): SourceAdapter {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${cfg.channelId}`;
  return createRssAdapter({ ...cfg, feedUrl, sourceType: SourceType.YouTube });
}
