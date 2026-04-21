import { BaseAgent } from './base';
import { AgentDomain } from '../types';
import { Category } from '../../types';

export class AIAgent extends BaseAgent {
  name   = 'AIAgent';
  domain: AgentDomain = 'ai';

  protected categories = [Category.AI, Category.Opportunities];

  protected keywords = /\bai\b|llm|gpt|claude|gemini|anthropic|openai|нейросет|искусственный интелл|новая модел|агент|инструмент|tool|workflow|автоматизац|coding|cursor|copilot|langchain|выпустил|вышел|released|launch/i;

  protected systemPrompt = `Ты — AI-аналитик. Специализация: новые AI-модели, инструменты, workflow, агентные системы, coding tools.
Фокус: практическая польза прямо сейчас. Без абстракций.
Формат каждого пункта (Telegram Markdown): **[Название](url)** — что это → зачем → конкретный use case.
Ссылки только из данных. Русский язык. Без хайпа без пользы.`;
}
