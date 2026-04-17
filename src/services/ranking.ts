import { NormalizedItem, RankedItem, Category, Confidence, SourceType } from '../types';
import { tierBonus, SOURCE_GOVERNANCE }                                  from './sourceGovernance';
import { getUserInterests, UserInterest }                                from '../db/userSourcesRepo';
import { getReputationBonuses }                                          from '../db/sourceReputationRepo';

// ─── Source Weights ───────────────────────────────────────────────────────────
// Base signal density score. Tier bonus from sourceGovernance.ts is added on top.

export const SOURCE_WEIGHTS: Record<string, number> = {
  // ── Market / Macro ─────────────────────────────────────────────────────────
  tg_spydell:          26,
  rss_exponentialview: 20,
  tg_markettwits:      16,
  tg_finance_instinct: 12,
  rss_tc_startups:     15,
  rss_hackernews:       9,

  // ── Crypto (lower — background signal, not the focus) ─────────────────────
  tg_hugsfund:            16,
  tg_bybit_announcements: 12,
  rss_theblock:           14,
  rss_coindesk:           12,
  rss_decrypt:            11,
  tg_falconinvestors:     12,
  tg_doubletop:           11,
  tg_finfalconx:          11,

  // ── AI Tools / Tech (highest priority) ───────────────────────────────────
  rss_openai_news:        30,   // official model releases
  rss_anthropic_blog:     28,   // official releases
  rss_simon_willison:     30,   // best practical LLM tooling signal
  rss_one_useful_thing:   24,   // research-backed AI use cases
  rss_huggingface_blog:   18,   // new open-source models
  rss_langchain_blog:     22,   // agents / workflow tooling
  rss_latent_space:       26,   // AI practitioners, deep signal
  rss_bensbites:          20,   // daily AI digest, curated
  rss_mit_ai:             13,
  rss_google_ai_blog:     14,
  tg_xb_prosmm:           10,

  // ── Opportunities ─────────────────────────────────────────────────────────
  rss_tldr_ai:          22,
  rss_producthunt_ai:   13,

  // ── Learning ──────────────────────────────────────────────────────────────
  rss_karpathy:         38,   // event-level — always essential
  rss_interconnects:    22,
  rss_import_ai:        18,
  rss_ycombinator:      14,
  rss_a16z_future:      18,
  rss_paulgraham:       30,   // rare but gold

  // ── Deep Knowledge / Thinking ─────────────────────────────────────────────
  deep_paulgraham:      35,   // rare but always gold
  deep_farnamstreet:    26,   // mental models, systems thinking
  deep_benevans:        28,   // tech strategy, market structure
  deep_notboring:       22,   // deep dives on companies and trends
  deep_scottgalloway:   20,   // contrarian, blunt, sharp analysis
  deep_lennys:          22,   // product + growth practitioners
  rss_stratechery:      28,
  rss_notboring:        20,
  rss_pmarca:           18,
  rss_lennys:           16,
  tg_margulan:           8,

  // ── New AI sources ────────────────────────────────────────────────────────
  rss_venturebeat_ai:   18,
  rss_the_decoder:      20,
  rss_wired_ai:         14,
  rss_rundown_ai:       18,
  rss_aivalley:         12,
  rss_the_batch:        24,   // Andrew Ng — always worth reading
  rss_towards_ai:       13,
  rss_ruder:            20,   // NLP deep-dives

  // ── Podcasts ──────────────────────────────────────────────────────────────
  rss_lex_fridman:        16,
  rss_invest_like_best:   18,
  rss_all_in_pod:         15,
  rss_hard_fork:          13,
  rss_my_first_million:   14,
  rss_knowledge_project:  16,
  rss_a16z_podcast:       14,

  // ── YouTube ───────────────────────────────────────────────────────────────
  yt_lexfridman:          18,
  yt_twominutepapers:     20,   // fast research signal
  yt_yannic:              18,   // deep ML paper reviews
  yt_3blue1brown:         22,   // rare but exceptional
  yt_ycombinator:         16,
  yt_allin:               14,
};

// ─── Category Weights ─────────────────────────────────────────────────────────

const CATEGORY_WEIGHTS: Record<Category, number> = {
  [Category.AI]:             20,   // Technologies / AI Tools — top priority
  [Category.Opportunities]:  16,   // actionable stuff
  [Category.Learning]:       12,   // deep research, rare high-value
  [Category.Thinking]:       10,   // strategy, founder frameworks
  [Category.MarketSignals]:   8,   // background signal
  [Category.Podcast]:         6,
  [Category.Crypto]:          4,   // background only, no dominance
  [Category.Macro]:           4,   // legacy
  [Category.Ideas]:           3,   // legacy
};

// ─── Freshness ────────────────────────────────────────────────────────────────

const FRESHNESS_RULES: Array<{ maxAgeMs: number; bonus: number }> = [
  { maxAgeMs:  4 * 3_600_000, bonus: 12 },
  { maxAgeMs: 12 * 3_600_000, bonus:  7 },
  { maxAgeMs: 24 * 3_600_000, bonus:  3 },
];

// ─── Signal Keywords ──────────────────────────────────────────────────────────

const SIGNAL_KEYWORDS: RegExp[] = [
  /\b(launched?|released?|announced?|introducing|shipped)\b/i,
  /\b(gpt|claude|gemini|llama|mistral|qwen|deepseek|o[123])\b/i,
  /\b(crash(ed)?|dump(ed)?|surged?|ath|all.?time.?high|rally)\b/i,
  /\b(fed|fomc|rate.?cut|rate.?hike|inflation|gdp|cpi)\b/i,
  /\b(acqui(red|sition)|ipo|merger|raised|funding|valuation)\b/i,
  /\b(hack(ed)?|exploit|breach|ban(ned)?|regulat)\b/i,
  /\b(breaking|urgent|alert)\b/i,
];

// ─── New Dimensions ───────────────────────────────────────────────────────────

const APPLICABILITY_HIGH: RegExp = /\b(tool|workflow|automation|prompt|tutorial|how.?to|template|plugin|integration|api|sdk|free|beta|open.?source|github|notebook|demo|guide|step.?by.?step|use.?case)\b/i;
const APPLICABILITY_LOW:  RegExp = /\b(analysis|opinion|theory|prediction|forecast|perspective|commentary|essay)\b/i;

function applicabilityScore(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (APPLICABILITY_HIGH.test(text)) return 10;
  if (APPLICABILITY_LOW.test(text))  return  0;
  return 3;
}

// "This just shipped" — максимальный буст, самый важный сигнал для early signal hunter
const LAUNCH_SIGNAL: RegExp = /\b(just.?(released?|launched?|shipped|dropped|announced)|introducing|now.?available|v\d+\.\d+|initial.?release|open.?sourced|released.?today|launches?|new.?feature|new.?model|new.?update|update.?released?)\b/i;
const NOVELTY_STRONG: RegExp = /\b(first|new|beta|early.?access|preview|announced|today)\b/i;
const NOVELTY_WEAK:   RegExp = /\b(overview|review|recap|retrospective|history|explained?|guide.?to|what.?is)\b/i;

function noveltyScore(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (LAUNCH_SIGNAL.test(text))  return 18;  // "just launched" → highest priority
  if (NOVELTY_STRONG.test(text)) return  8;
  if (NOVELTY_WEAK.test(text))   return  1;
  return 3;
}

const LEVERAGE_KEYWORDS: RegExp = /\b(automat(e|ion)|10x|save.?time|unfair|asymmetric|multiplier|competi(tive|tor)|moat|edge|leverage|scale|system|framework|arbitrage|underrated|hidden|most.?don.?t|few.?know)\b/i;
const HIGH_LEVERAGE_SOURCES = new Set([
  'rss_karpathy', 'rss_simon_willison', 'rss_stratechery', 'rss_latent_space',
  'rss_interconnects', 'rss_one_useful_thing', 'rss_anthropic_blog', 'rss_openai_news',
  'rss_langchain_blog', 'rss_paulgraham',
]);

function leverageScore(title: string, content: string, source: string): number {
  const text   = `${title} ${content}`;
  const srcBonus = HIGH_LEVERAGE_SOURCES.has(source) ? 6 : 0;
  return (LEVERAGE_KEYWORDS.test(text) ? 8 : 0) + srcBonus;
}

const PROFILE_MATCH: RegExp = /\b(ai|llm|agent|automation|workflow|crypto|bitcoin|defi|startup|founder|saas|product|revenue|growth|investment|venture|system|build|deploy|scale|tool|model)\b/i;
const PROFILE_NOISE: RegExp = /\b(celebrity|sports|gaming(?!.*ai)|fashion|lifestyle|cooking|travel|entertainment|movie|tv.?show)\b/i;

// Items with ZERO of: decision angle / idea / leverage / insight → score floor
const HAS_VALUE: RegExp = /\b(how|why|what|when|new|tool|build|launch|market|invest|ai|crypto|model|system|strategy|learn|growth|automat|insight|signal|opportunit|leverage|analys)\b/i;

function personalRelevanceScore(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (PROFILE_NOISE.test(text))              return -10;
  if (!HAS_VALUE.test(text))                 return  -5;  // no decision-relevant content
  if (PROFILE_MATCH.test(text))              return   8;
  return 0;
}

// ─── Depth Score ─────────────────────────────────────────────────────────────
// Signals long-form / research / systemic content — raises it above news

const DEPTH_HIGH: RegExp = /\b(research|paper|analysis|deep.?dive|breakdown|how.?it.?works|under.?the.?hood|case.?study|interview|essay|framework|mental.?model|lessons.?learned|report|study|thread|explained|architecture|mechanism|system.?design|behind.?the.?scenes|first.?principles|anatomy)\b/i;
const DEPTH_LOW:  RegExp = /\b(top\s*\d+|roundup|weekly.?digest|news|update|brief|summary|recap|listicle|highlights)\b/i;
const DEEP_KNOWLEDGE_SOURCES = new Set([
  'deep_paulgraham', 'deep_farnamstreet', 'deep_benevans', 'deep_notboring',
  'deep_scottgalloway', 'deep_lennys', 'deep_ribbonfarm', 'deep_darioamodei',
  'rss_karpathy', 'rss_interconnects', 'rss_latent_space', 'rss_stratechery',
  'rss_paulgraham', 'rss_notboring', 'rss_lennys',
]);

function depthScore(title: string, content: string, sourceType: SourceType, source: string): number {
  const text       = `${title} ${content}`;
  const isDeepSrc  = DEEP_KNOWLEDGE_SOURCES.has(source) || sourceType === SourceType.DeepKnowledge;
  const highMatch  = DEPTH_HIGH.test(text);
  const lowMatch   = DEPTH_LOW.test(text);

  if (isDeepSrc && highMatch) return 20;
  if (isDeepSrc)              return 14;
  if (highMatch && !lowMatch) return 10;
  if (lowMatch)               return  0;
  return 3;
}

// ─── Signal Strength ─────────────────────────────────────────────────────────
// How much this item should influence a decision today

const SIGNAL_HIGH: RegExp = /\b(now|today|this.?week|immediately|urgent|opportunity|risk|critical|must.?(know|read|use)|game.?changer|shifts?|changes?|major|significant|big|important|breaking|announcement|launched?|released?|available.?now|just)\b/i;
const SIGNAL_LOW:  RegExp = /\b(historical|retrospective|classic|old|archive|background|context.?only|for.?reference|overview|theory|academic)\b/i;

function signalStrength(title: string, content: string): number {
  const text = `${title} ${content}`;
  if (SIGNAL_HIGH.test(text) && !SIGNAL_LOW.test(text)) return 8;
  if (SIGNAL_LOW.test(text))                            return 0;
  return 3;
}

// ─── Confirmation Bonus ───────────────────────────────────────────────────────

function confirmationBonus(confirmationsCount: number): number {
  if (confirmationsCount >= 3) return 12;
  if (confirmationsCount >= 2) return  8;
  if (confirmationsCount >= 1) return  4;
  return 0;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

function computeConfidence(
  score:        number,
  source:       string,
  confirmations: number,
): Confidence {
  const isCoreSource = SOURCE_GOVERNANCE[source]?.priorityTier === 'core';

  if (score >= 55 || (score >= 42 && confirmations >= 2) || (isCoreSource && score >= 48)) {
    return 'high';
  }
  if (score >= 32 || confirmations >= 1) {
    return 'medium';
  }
  return 'low';
}

// ─── Main Scorer ──────────────────────────────────────────────────────────────

const MAX_SCORE     = 100;
const DEFAULT_TOP_N =  22;

function computeScore(item: NormalizedItem): number {
  const text = `${item.title} ${item.content}`;
  const ageMs = Date.now() - item.timestamp.getTime();

  const fresh = FRESHNESS_RULES.find((r) => ageMs < r.maxAgeMs)?.bonus ?? 0;
  const signalBonus = Math.min(
    SIGNAL_KEYWORDS.filter((re) => re.test(text)).length * 5,
    10,
  );
  const srcWeight = SOURCE_WEIGHTS[item.source] ?? 5;

  const total =
    srcWeight +
    tierBonus(item.source) +
    (CATEGORY_WEIGHTS[item.category] ?? 3) +
    fresh +
    signalBonus +
    applicabilityScore(item.title, item.content) +
    noveltyScore(item.title, item.content) +
    leverageScore(item.title, item.content, item.source) +
    personalRelevanceScore(item.title, item.content) +
    confirmationBonus(item.confirmationsCount ?? 0) +
    interestScore(item.title, item.content) +
    depthScore(item.title, item.content, item.sourceType, item.source) +
    signalStrength(item.title, item.content) +
    (_reputationCache.get(item.source) ?? 0);   // earned reputation bonus

  return Math.min(Math.max(total, 0), MAX_SCORE);
}

// ─── Category caps ────────────────────────────────────────────────────────────
// Prevent any single group from dominating the pool sent to the LLM.

const CATEGORY_CAP: Partial<Record<Category, number>> = {
  [Category.Crypto]:        3,   // background only — max 3
  [Category.MarketSignals]: 4,   // max 4 market items
  [Category.AI]:           10,   // wide pool — LLM picks best 5-7
  [Category.Opportunities]:  7,
};

// ─── User Interest Score ──────────────────────────────────────────────────────
// Cached in-memory; refreshed each pipeline run via RankingService.setInterests()

let _interestCache:    UserInterest[]       = [];
let _reputationCache: Map<string, number>  = new Map();

/** Call once per pipeline run to refresh both caches from DB. */
export async function refreshInterestCache(): Promise<void> {
  try {
    _interestCache    = await getUserInterests();
    _reputationCache  = await getReputationBonuses();
  } catch {
    _interestCache    = [];
    _reputationCache  = new Map();
  }
}

function interestScore(title: string, content: string): number {
  if (_interestCache.length === 0) return 0;
  const text  = `${title} ${content}`.toLowerCase();
  let   score = 0;
  for (const { keyword, weight } of _interestCache) {
    if (text.includes(keyword)) {
      // Heavier keywords (added many times) give more boost, capped at 15
      score += Math.min(weight * 2, 6);
    }
  }
  return Math.min(score, 15);
}

// ─── RankingService ───────────────────────────────────────────────────────────

export class RankingService {
  private readonly topN: number;

  constructor(topN: number = DEFAULT_TOP_N) {
    this.topN = topN;
  }

  rank(items: NormalizedItem[]): RankedItem[] {
    const scored = items
      .map((item): RankedItem => {
        const score      = computeScore(item);
        const confidence = computeConfidence(score, item.source, item.confirmationsCount ?? 0);
        return { ...item, score, rank: 0, confidence };
      })
      .sort((a, b) => b.score - a.score);

    // Apply per-category caps before final slice
    const catCount = new Map<Category, number>();
    const capped: RankedItem[] = [];

    for (const item of scored) {
      const cap     = CATEGORY_CAP[item.category];
      const current = catCount.get(item.category) ?? 0;
      if (cap !== undefined && current >= cap) continue;
      catCount.set(item.category, current + 1);
      capped.push(item);
      if (capped.length >= this.topN) break;
    }

    return capped.map((item, index) => ({ ...item, rank: index + 1 }));
  }
}

export const rankingService = new RankingService();
