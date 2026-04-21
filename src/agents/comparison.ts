import { ComparisonResult, ModelProvider } from './types';
import { logger } from '../utils/logger';

/**
 * Runs the same query through multiple providers, then asks the primary
 * provider to compare answers and produce a synthesis.
 */
export async function compareAnswers(
  query:     string,
  providers: ModelProvider[],
): Promise<ComparisonResult> {
  if (providers.length < 2) {
    const p = providers[0];
    if (!p) return { answers: [], synthesis: '', consistency: 'low' };
    const text = await p.call(
      'Отвечай на русском. Telegram Markdown. Коротко и по делу.',
      query,
      600,
    );
    return { answers: [{ model: p.name, text }], synthesis: text, consistency: 'high' };
  }

  const system     = 'Отвечай на русском. Telegram Markdown. Коротко и по делу.';
  const userPrompt = `Запрос: "${query}"\n\nДай аналитический ответ.`;

  const settled = await Promise.allSettled(
    providers.map(p => p.call(system, userPrompt, 600).then(text => ({ model: p.name, text }))),
  );

  const answers = settled
    .filter(r => r.status === 'fulfilled')
    .map(r => (r as PromiseFulfilledResult<{ model: string; text: string }>).value);

  if (answers.length < 2) {
    return { answers, synthesis: answers[0]?.text ?? '', consistency: 'low' };
  }

  // Ask the primary provider to compare and synthesize
  const [primary] = providers;
  const compareSystem = `Тебе дали ответы от нескольких AI-моделей на один запрос пользователя.
Найди пересечения. Убери дублирование. Синтезируй лучший ответ.
Оцени согласованность: high (все говорят одно), medium (есть расхождения), low (противоречия).
Верни ТОЛЬКО валидный JSON без markdown-блоков:
{"consistency":"high|medium|low","synthesis":"итоговый ответ пользователю"}`;

  const comparePrompt = `Запрос: "${query}"\n\n${answers.map(a => `[${a.model}]:\n${a.text}`).join('\n\n')}`;

  try {
    const raw    = await primary.call(compareSystem, comparePrompt, 900);
    const json   = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(json) as { consistency: string; synthesis: string };
    return {
      answers,
      synthesis:   parsed.synthesis ?? answers[0].text,
      consistency: (parsed.consistency as ComparisonResult['consistency']) ?? 'medium',
    };
  } catch (err) {
    logger.warn(`[comparison] synthesis parse failed: ${(err as Error).message}`);
    return { answers, synthesis: answers[0].text, consistency: 'medium' };
  }
}
