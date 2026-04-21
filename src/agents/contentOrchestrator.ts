// ─── Content Orchestrator — multi-agent pipeline for text/file input ─────────

import { AgentOutput, AgentSignal, AgentDomain, OrchestratorResponse } from './types';
import { ContentInput } from './contentInput';
import { analyzeContent } from './inputAnalyzer';
import { MarketAgent }     from './agents/marketAgent';
import { AIAgent }         from './agents/aiAgent';
import { TrendsAgent }     from './agents/trendsAgent';
import { KnowledgeAgent }  from './agents/knowledgeAgent';
import { GoalsAgent }      from './agents/goalsAgent';
import { PhilosophyAgent } from './agents/philosophyAgent';
import { getDefaultProvider } from './providers';
import { logger } from '../utils/logger';
import type { Agent } from './types';

// ── Domain → Agent factory ────────────────────────────────────────────────────

const DOMAIN_AGENTS: Record<AgentDomain, () => Agent> = {
  market:     () => new MarketAgent(),
  ai:         () => new AIAgent(),
  trends:     () => new TrendsAgent(),
  knowledge:  () => new KnowledgeAgent(),
  goals:      () => new GoalsAgent(),
  philosophy: () => new PhilosophyAgent(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const PROCESSING_LABELS: Record<string, string> = {
  explain:          'Объясни простым языком',
  summarize:        'Сожми без потери смысла',
  analyze:          'Разбери и выдели главное',
  extract_insights: 'Вытащи ключевые идеи и сигналы',
  extract_actions:  'Вытащи практические действия и возможности',
  extract_sources:  'Найди упомянутые источники, инструменты, компании',
};

function buildQuery(input: ContentInput, mode: string, summary: string): string {
  const label  = summary || (input.fileName ? `файл "${input.fileName}"` : 'предоставленный материал');
  const action = PROCESSING_LABELS[mode] ?? 'Проанализируй';
  return `${action}: ${label}`;
}

function contentToSignal(input: ContentInput): AgentSignal {
  return {
    title:   input.fileName ?? input.sourceName ?? 'Материал пользователя',
    content: input.rawText.slice(0, 3500),
    source:  input.sourceName ?? (input.fileName ? `файл: ${input.fileName}` : 'прямой ввод'),
  };
}

// ── Multi-agent synthesis ─────────────────────────────────────────────────────

const SYNTH_SYSTEM = `Ты — оркестратор. Объединяй ответы разных аналитиков в один структурированный ответ.
Убирай дублирование. Сохраняй самое важное.
Структура: что это → главное → инсайты → что можно использовать → что проверить дальше.
Telegram Markdown. Русский язык. Без воды.`;

async function synthesize(input: ContentInput, outputs: AgentOutput[]): Promise<string> {
  if (outputs.length === 0) return 'Нет данных по материалу.';
  if (outputs.length === 1) return outputs[0].analysis;

  const provider = getDefaultProvider();
  const combined = outputs
    .filter(o => o.analysis)
    .map(o => `=== ${o.agentName} ===\n${o.analysis}`)
    .join('\n\n');

  const label  = input.fileName ?? input.sourceName ?? 'материал';
  const prompt = `Материал: "${label}"\n\nАнализы агентов:\n${combined}\n\nСинтезируй в один ответ.`;
  try {
    return await provider.call(SYNTH_SYSTEM, prompt, 1100);
  } catch {
    return outputs.filter(o => o.analysis).map(o => o.analysis).join('\n\n---\n\n');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function runContentOrchestrator(input: ContentInput): Promise<OrchestratorResponse> {
  logger.info(`[contentOrchestrator] inputType=${input.inputType} len=${input.rawText.length}`);

  const cls = await analyzeContent(input);
  logger.info(`[contentOrchestrator] topics=[${cls.dominantTopics.join(',')}] mode=${cls.processingMode}`);

  const agents = cls.dominantTopics
    .map(d => DOMAIN_AGENTS[d]?.())
    .filter((a): a is Agent => !!a);
  const safeAgents = agents.length > 0 ? agents : [new KnowledgeAgent()];

  const signal   = contentToSignal(input);
  const query    = buildQuery(input, cls.processingMode, cls.summary);
  const provider = getDefaultProvider();

  const analyzeResults = await Promise.allSettled(
    safeAgents.map(a => a.analyze([signal], query, provider)),
  );

  const outputs: AgentOutput[] = analyzeResults
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<AgentOutput>).value)
    .filter(o => o.analysis.length > 0);

  const synthesis = await synthesize(input, outputs);

  return {
    query,
    agentsUsed: safeAgents.map(a => a.domain) as AgentDomain[],
    outputs,
    synthesis,
  };
}
