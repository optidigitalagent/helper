import { SourceAdapter } from '../types';
import { cryptoSources }      from './sources/cryptoSources';
import { macroSources }       from './sources/macroSources';
import { aiTechSources }      from './sources/aiTechSources';
import { businessSources }    from './sources/businessSources';
import { podcastSources }     from './sources/podcastSources';
import { learningSources }    from './sources/learningSources';
import { thinkingSources }    from './sources/thinkingSources';
import { opportunitySources } from './sources/opportunitySources';
import { youtubeSources }     from './sources/youtubeSources';
import { mockSourceAdapter }  from './mockSource';

// Set USE_MOCK_SOURCE=true in .env to run the full pipeline against fake data
const USE_MOCK = process.env.USE_MOCK_SOURCE === 'true';

export const allAdapters: SourceAdapter[] = USE_MOCK
  ? [mockSourceAdapter]
  : [
      ...macroSources,
      ...cryptoSources,
      ...opportunitySources,
      ...aiTechSources,
      ...learningSources,
      ...thinkingSources,
      ...businessSources,
      ...podcastSources,
      ...youtubeSources,
    ];
