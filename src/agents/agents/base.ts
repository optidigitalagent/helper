import { Agent, AgentDomain, AgentOutput, AgentSignal, ModelProvider } from '../types';
import { getUnsentItems } from '../../db/itemsRepo';
import { Category } from '../../types';
import { logger } from '../../utils/logger';

export abstract class BaseAgent implements Agent {
  abstract name:   string;
  abstract domain: AgentDomain;

  protected abstract categories:    Category[];
  protected abstract keywords:      RegExp;
  protected abstract systemPrompt:  string;

  canHandle(query: string): boolean {
    return this.keywords.test(query);
  }

  async gatherSignals(_query: string): Promise<AgentSignal[]> {
    try {
      const since = new Date(Date.now() - 24 * 3_600_000);
      const items = await getUnsentItems(since, 20, this.categories);
      return items.map(item => ({
        title:     item.title,
        url:       item.url,
        content:   item.content.slice(0, 500),
        source:    item.sourceName ?? item.source,
        score:     item.score,
        timestamp: item.timestamp,
        category:  item.category,
      }));
    } catch (err) {
      logger.warn(`[${this.name}] gatherSignals failed: ${(err as Error).message}`);
      return [];
    }
  }

  async analyze(signals: AgentSignal[], query: string, provider: ModelProvider): Promise<AgentOutput> {
    const signalsBlock = signals.length > 0
      ? signals.map((s, i) =>
          `[${i + 1}] ${s.source} — ${s.title}${s.url ? ` → ${s.url}` : ''}\n${s.content}`
        ).join('\n\n')
      : '(нет свежих данных из источников)';

    const userPrompt =
      `Запрос: "${query}"\n\nДанные:\n${signalsBlock}\n\n` +
      `Дай аналитический ответ на русском. Telegram Markdown. Без воды.`;

    try {
      const analysis = await provider.call(this.systemPrompt, userPrompt, 600);
      return {
        agentName:  this.name,
        domain:     this.domain,
        signals,
        analysis,
        confidence: signals.length >= 3 ? 'high' : signals.length >= 1 ? 'medium' : 'low',
        model:      provider.name,
      };
    } catch (err) {
      logger.warn(`[${this.name}] analyze failed: ${(err as Error).message}`);
      return {
        agentName:  this.name,
        domain:     this.domain,
        signals,
        analysis:   '',
        confidence: 'low',
        model:      provider.name,
      };
    }
  }
}
