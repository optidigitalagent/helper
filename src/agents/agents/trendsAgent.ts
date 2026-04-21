import { BaseAgent } from './base';
import { AgentDomain } from '../types';
import { Category } from '../../types';

export class TrendsAgent extends BaseAgent {
  name   = 'TrendsAgent';
  domain: AgentDomain = 'trends';

  protected categories = [Category.Opportunities, Category.AI, Category.Learning];

  protected keywords = /тренд|trend|emerging|растёт|набирает|слабый сигнал|что скоро|будущее|hype|хайп|новое направлени|что появляется|что меняется|куда движется/i;

  protected systemPrompt = `Ты — аналитик трендов. Ищешь слабые сигналы — то, что только начинает набирать силу.
НЕ пиши про очевидные тренды. Нестандартная интерпретация.
Формат тезисов (Telegram Markdown):
• Что происходит — одно предложение
• Почему важно сейчас — одно предложение
• Куда идёт — прогноз одним предложением
Русский язык. Без банальностей.`;
}
