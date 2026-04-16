import { SourceAdapter, NormalizedItem, RawSourceItem, Category, SourceType } from '../types';
import { makeId } from '../utils/hash';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NOW = new Date();
const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * 3_600_000);
const iso = (d: Date): string => d.toISOString();

// ─── Raw mock data ─────────────────────────────────────────────────────────────
// 14 items: crypto×5, ai×4, macro×3, ideas×2
// source values match real adapter IDs so the scorer can apply source priority.

const RAW_ITEMS: RawSourceItem[] = [

  // ── CRYPTO (5) ──────────────────────────────────────────────────────────────

  {
    source:     'tg_hugsfund',
    sourceType: SourceType.Telegram,
    title:      'BTC reclaims $71K after 3-day consolidation — volume confirms breakout',
    content:    'Bitcoin closed above $71,200 with spot volume 40% above 30-day average. On-chain data shows 85K BTC moved off exchanges in the past 48 hours, reducing sell-side liquidity. Next resistance at $73,500.',
    url:        'https://t.me/HugsFund/1482',
    timestamp:  iso(hoursAgo(1)),
  },
  {
    source:     'tg_bybit_announcements',
    sourceType: SourceType.Telegram,
    title:      'Bybit lists EIGEN with 10× leverage — trading opens April 7 at 10:00 UTC',
    content:    'Bybit will list EigenLayer (EIGEN) perpetual futures with up to 10× leverage. Spot trading opens simultaneously. Initial margin requirement set at 10%. Funding rate snapshots begin 1 hour before launch.',
    url:        'https://t.me/Bybit_Announcements/4201',
    timestamp:  iso(hoursAgo(3)),
  },
  {
    source:     'tg_doubletop',
    sourceType: SourceType.Telegram,
    title:      'ETH/BTC ratio hits 3-month low — capital rotating into BTC dominance play',
    content:    'ETH/BTC dropped to 0.0455, the lowest level since January. BTC dominance crossed 54.2%. Historically this setup precedes either an altcoin flush or a BTC ATH attempt within 2–3 weeks.',
    url:        'https://t.me/doubletop/892',
    timestamp:  iso(hoursAgo(5)),
  },
  {
    source:     'tg_falconinvestors',
    sourceType: SourceType.Telegram,
    title:      'Grayscale files for Solana spot ETF — joins VanEck and 21Shares in the queue',
    content:    'Grayscale submitted a 19b-4 filing to the SEC for a Solana spot ETF, citing growing institutional demand. Three firms have now filed for SOL ETFs. Legal experts estimate a 40% approval probability before year-end given current regulatory climate.',
    url:        'https://t.me/falconinvestors/2341',
    timestamp:  iso(hoursAgo(8)),
  },
  {
    source:     'tg_finfalconx',
    sourceType: SourceType.Telegram,
    title:      'Stablecoin supply reaches all-time high of $168B — bullish dry powder signal',
    content:    'Total stablecoin market cap hit $168B, up $12B in 30 days. USDT accounts for 72% of supply. Historically, stablecoin ATHs precede major market moves as sidelined capital deploys into risk assets.',
    url:        'https://t.me/finfalconx/1105',
    timestamp:  iso(hoursAgo(11)),
  },

  // ── AI / TECH (4) ────────────────────────────────────────────────────────────

  {
    source:     'rss_openai_news',
    sourceType: SourceType.Official,
    title:      'OpenAI launches GPT-4.5 Turbo with 50% cost reduction and faster inference',
    content:    'GPT-4.5 Turbo is now available in the API. Input tokens cost $1.50 per 1M (down from $3.00). Latency improved by 35% on standard benchmarks. Context window remains 128K. Recommended for production workloads replacing GPT-4o.',
    url:        'https://openai.com/blog/gpt-4-5-turbo',
    timestamp:  iso(hoursAgo(2)),
  },
  {
    source:     'rss_anthropic_news',
    sourceType: SourceType.Official,
    title:      'Anthropic releases Claude 3.7 Sonnet with extended thinking and 200K context',
    content:    'Claude 3.7 Sonnet introduces an optional "extended thinking" mode that lets the model reason before answering. Context window expanded to 200K tokens. API pricing unchanged. Early benchmarks show +18% improvement on complex coding tasks over Claude 3.5.',
    url:        'https://www.anthropic.com/news/claude-3-7-sonnet',
    timestamp:  iso(hoursAgo(4)),
  },
  {
    source:     'rss_huggingface_blog',
    sourceType: SourceType.RSS,
    title:      'Hugging Face releases SmolAgents 1.0 — lightweight open-source agent framework',
    content:    'SmolAgents 1.0 is now stable. Supports tool use, multi-step planning, and sandboxed Python execution with under 1,000 lines of core code. Compatible with any HF model. Designed as a minimal alternative to LangChain and AutoGPT.',
    url:        'https://huggingface.co/blog/smolagents-1-0',
    timestamp:  iso(hoursAgo(7)),
  },
  {
    source:     'tg_xb_prosmm',
    sourceType: SourceType.Telegram,
    title:      'Google DeepMind announces Gemini 2.0 Pro — native multimodal output including audio',
    content:    'Gemini 2.0 Pro adds native audio generation alongside text and image output. Supports real-time streaming for voice assistants. Available via Vertex AI. Benchmark scores beat GPT-4o on math and science reasoning tasks by 6–9%.',
    url:        'https://t.me/xb_prosmm/3871',
    timestamp:  iso(hoursAgo(13)),
  },

  // ── MACRO (3) ────────────────────────────────────────────────────────────────

  {
    source:     'tg_finance_instinct',
    sourceType: SourceType.Telegram,
    title:      'Fed minutes reveal growing concern over sticky services inflation',
    content:    'March FOMC minutes show three members pushed to delay any rate cut until Q4. Services inflation ex-housing remains at 4.1% annualized. Markets repriced from 3 cuts to 2 cuts expected in 2025 after the release. Dollar index rose 0.4%.',
    url:        'https://t.me/Finance_Instinct/2204',
    timestamp:  iso(hoursAgo(6)),
  },
  {
    source:     'yt_humphrey_yang',
    sourceType: SourceType.YouTube,
    title:      'US 10-year yield hits 4.7% — what it means for stocks, mortgages, and crypto',
    content:    'The 10-year Treasury yield reached 4.7%, the highest since November 2023. Rising yields compress equity valuations (especially growth stocks) and increase mortgage rates. Historically, BTC has shown a 30-day lag correlation of -0.45 with the 10Y yield.',
    url:        'https://youtube.com/watch?v=humphrey-10y-yield',
    timestamp:  iso(hoursAgo(9)),
  },
  {
    source:     'yt_mark_tilbury',
    sourceType: SourceType.YouTube,
    title:      'Why the US dollar losing reserve currency status is slower than people think',
    content:    'Despite BRICS expansion and de-dollarization headlines, USD still represents 58% of global FX reserves. Dollar share has declined from 72% in 2000 — a 20-year structural shift, not a sudden collapse. Near-term risk is overblown; long-term trend is real.',
    url:        'https://youtube.com/watch?v=tilbury-dollar-reserve',
    timestamp:  iso(hoursAgo(15)),
  },

  // ── IDEAS (2) ────────────────────────────────────────────────────────────────

  {
    source:     'tg_margulan',
    sourceType: SourceType.Telegram,
    title:      'The "boring business" model: why unsexy industries generate the most durable wealth',
    content:    'Three patterns in businesses that quietly compound over decades: (1) recurring contracts with switching costs, (2) local monopoly in underserved markets, (3) owner-operator alignment with no VC pressure. Examples: laundromats, B2B SaaS for niche industries, accountancy software.',
    url:        'https://t.me/MargulanSeissembai/4102',
    timestamp:  iso(hoursAgo(18)),
  },
  {
    source:     'tg_zuevichigor',
    sourceType: SourceType.Telegram,
    title:      'How to position yourself as an expert before you feel ready — the 20% rule',
    content:    'You only need to know 20% more than your target audience to credibly teach and charge for knowledge. Most people wait until they know everything — a threshold that never arrives. The practical move: start documenting what you learn two levels above where you started.',
    url:        'https://t.me/zuevichigor/891',
    timestamp:  iso(hoursAgo(21)),
  },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns 14 realistic raw source items covering all four categories.
 * Use this to test the full pipeline (normalize → score → digest → send)
 * without connecting to any external APIs.
 *
 * Distribution: crypto×5 | ai×4 | macro×3 | ideas×2
 */
export async function getMockData(): Promise<RawSourceItem[]> {
  return RAW_ITEMS;
}

// ─── NormalizedItem adapter (used by the pipeline via allAdapters) ─────────────

// Category lookup by source ID — mirrors what real adapters encode via config
const SOURCE_CATEGORY: Record<string, Category> = {
  tg_hugsfund:              Category.Crypto,
  tg_bybit_announcements:   Category.Crypto,
  tg_doubletop:             Category.Crypto,
  tg_falconinvestors:       Category.Crypto,
  tg_finfalconx:            Category.Crypto,
  rss_openai_news:          Category.AI,
  rss_anthropic_news:       Category.AI,
  rss_huggingface_blog:     Category.AI,
  tg_xb_prosmm:             Category.AI,
  tg_finance_instinct:      Category.Macro,
  yt_humphrey_yang:         Category.Macro,
  yt_mark_tilbury:          Category.Macro,
  tg_margulan:              Category.Ideas,
  tg_zuevichigor:           Category.Ideas,
};

export const mockSourceAdapter: SourceAdapter = {
  id:   'mock',
  name: 'Mock Source',

  async fetch(since: Date | null): Promise<NormalizedItem[]> {
    const fetchedAt = new Date();
    const raw = await getMockData();

    return raw
      .filter((item) => {
        if (since === null) return true;
        return new Date(item.timestamp) > since;
      })
      .map((item) => ({
        id:         makeId(item.source, item.url ?? item.title),
        source:     item.source,
        sourceType: item.sourceType,
        category:   SOURCE_CATEGORY[item.source] ?? Category.Crypto,
        title:      item.title,
        content:    item.content,
        url:        item.url,
        timestamp:  new Date(item.timestamp),
        fetchedAt,
        score:      0,
        tags:       [],
        raw:        item as unknown as Record<string, unknown>,
      }));
  },
};
