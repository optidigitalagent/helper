// ─── Source Governance Registry ───────────────────────────────────────────────
// Single source of truth for source quality metadata.
// Ranking uses this — no need to thread through adapter configs.

export type SourceRole      = 'signal' | 'research' | 'tools' | 'learning' | 'mindset' | 'podcast';
export type PriorityTier    = 'core' | 'secondary' | 'experimental';

export interface SourceMeta {
  role:         SourceRole;
  priorityTier: PriorityTier;
  noisy?:       boolean;    // true = high volume, low avg quality → score penalty
  notes?:       string;     // for human reference only
}

export const SOURCE_GOVERNANCE: Record<string, SourceMeta> = {

  // ── Market Signals ─────────────────────────────────────────────────────────
  tg_spydell:          { role: 'signal',   priorityTier: 'core',        notes: 'Best RU macro analyst, data-driven, non-obvious' },
  rss_exponentialview: { role: 'research', priorityTier: 'core',        notes: 'Macro + tech convergence, rare framing' },
  tg_finance_instinct: { role: 'signal',   priorityTier: 'secondary' },
  rss_tc_startups:     { role: 'signal',   priorityTier: 'secondary',   notes: 'Deal flow signal' },
  tg_markettwits:      { role: 'signal',   priorityTier: 'secondary',   noisy: true, notes: 'Fast but repetitive' },
  rss_hackernews:      { role: 'signal',   priorityTier: 'secondary',   noisy: true, notes: 'Builder consensus indicator' },

  // ── Crypto ─────────────────────────────────────────────────────────────────
  tg_hugsfund:            { role: 'signal',   priorityTier: 'core' },
  tg_bybit_announcements: { role: 'signal',   priorityTier: 'core',     notes: 'Exchange listings = on-chain signal' },
  rss_theblock:           { role: 'research', priorityTier: 'secondary', notes: 'Institutional data' },
  tg_falconinvestors:     { role: 'signal',   priorityTier: 'secondary' },
  tg_doubletop:           { role: 'signal',   priorityTier: 'secondary' },
  tg_finfalconx:          { role: 'signal',   priorityTier: 'secondary' },

  // ── Opportunities ──────────────────────────────────────────────────────────
  rss_tldr_ai:          { role: 'tools',    priorityTier: 'core',       notes: 'Daily AI tools, curated, consistent quality' },
  rss_simon_willison:   { role: 'tools',    priorityTier: 'core',       notes: 'Most practical LLM practitioner blog' },
  rss_one_useful_thing: { role: 'tools',    priorityTier: 'core',       notes: 'Research-backed, immediately applicable' },
  rss_producthunt_ai:   { role: 'tools',    priorityTier: 'secondary',  noisy: true, notes: 'Many launches, filter needed' },

  // ── Learning ───────────────────────────────────────────────────────────────
  rss_karpathy:         { role: 'learning', priorityTier: 'core',       notes: 'Rare, always essential — treat as event' },
  rss_interconnects:    { role: 'research', priorityTier: 'core',       notes: 'RLHF/alignment from inside labs' },
  rss_import_ai:        { role: 'research', priorityTier: 'secondary' },
  rss_huggingface_blog: { role: 'research', priorityTier: 'secondary' },
  rss_ycombinator:      { role: 'learning', priorityTier: 'secondary' },

  // ── AI (feeds into Opportunities/Learning via reclassification) ────────────
  rss_openai_news:      { role: 'research', priorityTier: 'core',       notes: 'Official model releases only' },
  rss_google_ai_blog:   { role: 'research', priorityTier: 'secondary' },
  rss_mit_ai:           { role: 'research', priorityTier: 'secondary',  noisy: true },
  tg_xb_prosmm:         { role: 'tools',    priorityTier: 'secondary',  noisy: true },

  // ── Thinking ───────────────────────────────────────────────────────────────
  rss_stratechery:      { role: 'mindset',  priorityTier: 'core',       notes: 'Best tech strategy analysis alive' },
  rss_notboring:        { role: 'mindset',  priorityTier: 'secondary' },
  rss_pmarca:           { role: 'mindset',  priorityTier: 'experimental', notes: 'Rare but contrarian signal when active' },
  tg_margulan:          { role: 'mindset',  priorityTier: 'secondary' },

  // ── Podcasts ───────────────────────────────────────────────────────────────
  rss_lex_fridman:      { role: 'podcast',  priorityTier: 'secondary' },
  rss_invest_like_best: { role: 'podcast',  priorityTier: 'secondary' },
};

/** Scoring bonus/penalty by tier. Applied on top of source weight. */
export function tierBonus(sourceId: string): number {
  const meta = SOURCE_GOVERNANCE[sourceId];
  if (!meta) return 0;
  if (meta.noisy) return -10;
  switch (meta.priorityTier) {
    case 'core':         return  10;
    case 'secondary':    return   0;
    case 'experimental': return  -3;   // lower default but experimental can still win on content
    default:             return   0;
  }
}

/** Role of a source — used by formatter and LLM prompt for context. */
export function sourceRole(sourceId: string): SourceRole {
  return SOURCE_GOVERNANCE[sourceId]?.role ?? 'signal';
}
