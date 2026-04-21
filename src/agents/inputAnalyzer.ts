// ─── Input Analyzer — LLM-based content classifier ───────────────────────────

import { AgentDomain } from './types';
import { ContentInput, ProcessingMode } from './contentInput';
import { getDefaultProvider } from './providers';
import { logger } from '../utils/logger';

export interface ContentAnalysis {
  dominantTopics: AgentDomain[];
  processingMode: ProcessingMode;
  summary:        string;
}

const SYSTEM = `Analyze the text excerpt and return ONLY valid JSON — no markdown, no commentary.

Fields:
- dominantTopics: array of 1-3 values from: market|ai|trends|knowledge|goals|philosophy
  market     = markets, crypto, macro, economy, geopolitics, finance
  ai         = AI models, tools, agents, automation, technology, software
  trends     = weak signals, emerging topics, new directions, innovations
  knowledge  = ideas, books, podcasts, frameworks, deep content, concepts
  goals      = strategy, priorities, personal development, planning
  philosophy = principles, mindset, wisdom, thinking, ethics, mental models
- processingMode: one value from: explain|summarize|analyze|extract_insights|extract_actions|extract_sources
  explain          = short unclear concept or term needing explanation
  summarize        = long structured document needing compression
  analyze          = mixed content that needs breakdown and key points
  extract_insights = content rich with ideas/signals/non-obvious observations
  extract_actions  = content with practical steps, tools, or opportunities
  extract_sources  = content mentioning many sources, people, companies, tools
- summary: one sentence in Russian describing what the content is about

Return ONLY: {"dominantTopics":["..."],"processingMode":"...","summary":"..."}`;

export async function analyzeContent(input: ContentInput): Promise<ContentAnalysis> {
  const preview = input.rawText.slice(0, 2000);
  try {
    const provider = getDefaultProvider();
    const raw  = await provider.call(SYSTEM, preview, 200);
    const json = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const p    = JSON.parse(json);
    return {
      dominantTopics: Array.isArray(p.dominantTopics) ? (p.dominantTopics as AgentDomain[]) : ['knowledge'],
      processingMode: (p.processingMode as ProcessingMode) ?? 'analyze',
      summary:        typeof p.summary === 'string' ? p.summary : '',
    };
  } catch (err) {
    logger.warn(`[inputAnalyzer] classification failed: ${(err as Error).message}`);
    return { dominantTopics: ['knowledge'], processingMode: 'analyze', summary: '' };
  }
}
