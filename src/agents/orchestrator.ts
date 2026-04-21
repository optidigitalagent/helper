import { Agent, AgentDomain, AgentOutput, OrchestratorRequest, OrchestratorResponse } from './types';
import { MarketAgent }      from './agents/marketAgent';
import { AIAgent }          from './agents/aiAgent';
import { TrendsAgent }      from './agents/trendsAgent';
import { KnowledgeAgent }   from './agents/knowledgeAgent';
import { GoalsAgent }       from './agents/goalsAgent';
import { PhilosophyAgent }  from './agents/philosophyAgent';
import { getDefaultProvider, getAvailableProviders } from './providers';
import { compareAnswers }   from './comparison';
import { logger }           from '../utils/logger';

// ─── Agent registry ───────────────────────────────────────────────────────────

const AGENTS: Agent[] = [
  new MarketAgent(),
  new AIAgent(),
  new TrendsAgent(),
  new KnowledgeAgent(),
  new GoalsAgent(),
  new PhilosophyAgent(),
];

// ─── Agent selection ──────────────────────────────────────────────────────────

function selectAgents(query: string): Agent[] {
  const matched = AGENTS.filter(a => a.canHandle(query));
  // Fallback: KnowledgeAgent handles everything if nothing matches
  return matched.length > 0 ? matched : [new KnowledgeAgent()];
}

// ─── Synthesis ────────────────────────────────────────────────────────────────

async function synthesizeOutputs(
  query:   string,
  outputs: AgentOutput[],
): Promise<string> {
  if (outputs.length === 0) return 'Нет данных по запросу.';
  if (outputs.length === 1) return outputs[0].analysis || 'Агент не нашёл релевантных данных.';

  const provider = getDefaultProvider();

  const combined = outputs
    .filter(o => o.analysis)
    .map(o => `=== ${o.agentName} ===\n${o.analysis}`)
    .join('\n\n');

  const system = `Ты — оркестратор. Объединяй ответы разных аналитиков в один чёткий ответ пользователю.
Убирай дублирование. Сохраняй самое важное. Структурируй логично.
Telegram Markdown. Русский язык. Без воды и лишних вступлений.`;

  const prompt = `Запрос пользователя: "${query}"\n\nОтветы аналитиков:\n${combined}\n\nСинтезируй в один ответ.`;

  try {
    return await provider.call(system, prompt, 900);
  } catch {
    // Fallback: join agent analyses with separator
    return outputs.filter(o => o.analysis).map(o => o.analysis).join('\n\n---\n\n');
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runOrchestrator(req: OrchestratorRequest): Promise<OrchestratorResponse> {
  const { query, compareModels = false } = req;
  logger.info(`[orchestrator] query="${query.slice(0, 80)}"`);

  const agents   = selectAgents(query);
  const provider = getDefaultProvider();

  logger.info(
    `[orchestrator] agents=[${agents.map(a => a.domain).join(',')}] provider=${provider.name}`,
  );

  // Gather signals from all selected agents in parallel
  const signalResults = await Promise.allSettled(agents.map(a => a.gatherSignals(query)));

  // Analyze in parallel — each agent gets its own signals
  const analyzeResults = await Promise.allSettled(
    agents.map((a, i) => {
      const signals =
        signalResults[i].status === 'fulfilled'
          ? (signalResults[i] as PromiseFulfilledResult<Awaited<ReturnType<Agent['gatherSignals']>>>).value
          : [];
      return a.analyze(signals, query, provider);
    }),
  );

  const outputs: AgentOutput[] = analyzeResults
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<AgentOutput>).value)
    .filter(o => o.analysis.length > 0);

  // Optional: multi-model comparison (only if explicitly requested and >1 key configured)
  let comparisonNote: string | undefined;
  if (compareModels) {
    const available = getAvailableProviders();
    if (available.length > 1) {
      try {
        const result = await compareAnswers(query, available.slice(0, 2));
        const icons: Record<string, string> = { high: '✅', medium: '⚠️', low: '❌' };
        comparisonNote = `${icons[result.consistency] ?? '⚠️'} Согласованность моделей: ${result.consistency}`;
      } catch (err) {
        logger.warn(`[orchestrator] comparison failed: ${(err as Error).message}`);
      }
    }
  }

  const synthesis = await synthesizeOutputs(query, outputs);

  return {
    query,
    agentsUsed: agents.map(a => a.domain) as AgentDomain[],
    outputs,
    synthesis,
    comparisonNote,
  };
}
