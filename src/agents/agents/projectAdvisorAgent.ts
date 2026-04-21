import { BaseAgent } from './base';
import { AgentDomain, AgentOutput, AgentSignal, ModelProvider } from '../types';
import { Category } from '../../types';
import { searchWeb } from '../../services/webSearch';
import { logger } from '../../utils/logger';

// ─── Project Advisor Agent ────────────────────────────────────────────────────
// Handles project tasks: feasibility, architecture, tooling, pricing,
// implementation planning, prompt writing, doc/TZ analysis.
// Uniquely: augments signals with live web search for pricing/API queries.

export class ProjectAdvisorAgent extends BaseAgent {
  name   = 'ProjectAdvisorAgent';
  domain: AgentDomain = 'project';

  protected categories = [Category.AI, Category.Opportunities, Category.Learning];

  protected keywords =
    /\bпроект\b|реализова|запустит\b|построит\b|создат\b|разработа|собрат\b|архитектур|стек\b|\bмвп\b|\bmvp\b|прототип|монетизац|можно ли (сделат|реализоват|запустит|построит|создат)|как (сделат|реализоват|запустит|построит|собрат|имплементиров)|как организоват|implement\b|feasib|техзадани|\bтз\b|спецификац|требовани к|деплой|deploy\b|hosting\b|бэкенд|фронтенд|backend\b|frontend\b|database\b|инфраструктур|напиши промпт|write.*prompt|prompt for\b|prompt под\b/i;

  protected systemPrompt = `Ты — Project Advisor Agent. Сильный технический архитектор, AI-builder и продуктовый стратег.
Помогаешь строить проекты: от идеи до работающего решения.

Ты определяешь тип задачи и отвечаешь структурированно:
→ feasibility  — "можно ли это сделать" → честная оценка: что возможно, что нет, реальная сложность
→ architecture — "как построить" → стек, структура, компоненты, масштабирование
→ tooling      — "какие сервисы/платформы/API" → конкретные инструменты с плюсами/минусами и ценами
→ pricing      — "сколько стоит X" → тарифы, лимиты, что бесплатно, реальные цифры из данных
→ implementation — "как конкретно реализовать" → пошагово, критические точки, порядок шагов
→ prompting    — "напиши промпт для X" → готовый production-ready промпт в code block
→ product      — "как структурировать продукт" → MVP-scope, монетизация, что убрать, приоритеты
→ doc_analysis — "посмотри файл/ТЗ/заметки" → разбор требований, оценка, практический план

ФОРМАТ ОТВЕТА (Telegram Markdown — строго, без воды):

**🎯 Задача:** [тип одной строкой]

**✅ Вывод:** [прямой ответ — без "зависит" без конкретики. Да / Нет / Как именно]

**💡 Лучший вариант:**
[конкретный подход + почему именно он, не абстрактно]

**🔀 Альтернативы:**
• **Вариант A** — плюс → минус
• **Вариант B** — плюс → минус

**⚠️ Риски:**
• [конкретный риск] → как снизить

**🛠 Стек / инструменты:**
• **[Название](url если есть в данных)** — зачем, [цена/лимит если известен]

**⚡️ Следующий шаг:**
[одно конкретное действие прямо сейчас — не "изучи документацию", а что именно сделать]

ПРАВИЛА:
- Всегда конкретная рекомендация. "Зависит от задачи" без продолжения — запрещено.
- Если в данных есть цены/лимиты из поиска — используй их, не придумывай.
- Если это файл/ТЗ/заметки — первая строка: что это такое, потом практический план.
- Если просят промпт — готовый промпт в \`\`\`code block\`\`\` + одна строка пояснения.
- Если задача смешанная — разбей на части, отвечай по каждой.
- Русский язык. Названия технологий/сервисов — на английском. Telegram Markdown.`;

  // ── gatherSignals: DB items + live web search for pricing/tooling queries ──

  async gatherSignals(query: string): Promise<AgentSignal[]> {
    const dbSignals = await super.gatherSignals(query);

    const needsSearch = /цена|тариф|стоимост|pricing|plan|tier|лимит|rate.?limit|api\b|сравн|vs\b|versus|бесплатн|free\b|платн|paid|документац|doc\b|docs\b/i.test(query);
    if (!needsSearch) return dbSignals;

    try {
      // Build focused English search query
      const englishTerms = (query.match(/[A-Za-z][A-Za-z0-9\-\.]{2,}/g) ?? []).join(' ');
      const searchQuery  = englishTerms.length > 4
        ? `${englishTerms} pricing API limits documentation 2025`
        : `${query} pricing API 2025`;

      const webItems   = await searchWeb(searchQuery, 5);
      const webSignals = webItems.map(item => ({
        title:   item.title,
        url:     item.url ?? '',
        content: item.content.slice(0, 500),
        source:  item.sourceName ?? 'Web Search',
      }));
      logger.info(`[ProjectAdvisorAgent] web search: +${webSignals.length} results`);
      return [...dbSignals, ...webSignals];
    } catch (err) {
      logger.warn(`[ProjectAdvisorAgent] web search skipped: ${(err as Error).message}`);
      return dbSignals;
    }
  }

  // ── analyze: same pipeline but with higher token budget ───────────────────

  async analyze(signals: AgentSignal[], query: string, provider: ModelProvider): Promise<AgentOutput> {
    const signalsBlock = signals.length > 0
      ? signals.map((s, i) =>
          `[${i + 1}] ${s.source} — ${s.title}${s.url ? ` → ${s.url}` : ''}\n${s.content}`
        ).join('\n\n')
      : '(нет данных из источников — отвечай из своих знаний об инструментах, ценах и архитектуре)';

    const userPrompt =
      `Запрос: "${query}"\n\nДанные / результаты поиска:\n${signalsBlock}\n\n` +
      `Дай структурированный практический ответ строго по формату из системного промпта. Telegram Markdown.`;

    try {
      const analysis = await provider.call(this.systemPrompt, userPrompt, 1400);
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
      return { agentName: this.name, domain: this.domain, signals, analysis: '', confidence: 'low', model: provider.name };
    }
  }
}
