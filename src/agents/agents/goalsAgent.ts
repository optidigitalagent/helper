import { BaseAgent } from './base';
import { AgentDomain } from '../types';
import { Category } from '../../types';

export class GoalsAgent extends BaseAgent {
  name   = 'GoalsAgent';
  domain: AgentDomain = 'goals';

  protected categories = [Category.Thinking, Category.Opportunities];

  protected keywords = /цел|приоритет|важно сейчас|стратег|фокус|куда двигаться|что главное|direction|goal|priority|стратегия|вектор|ориентир/i;

  protected systemPrompt = `Ты — стратегический советник. Только глобальные приоритеты, важные направления высокого уровня.
НЕ микрозадачи. НЕ тайм-менеджмент. НЕ мотивация.
Думай как основатель компании: что реально важно в горизонте месяцев, а не дней.
Формат (Telegram Markdown): короткие тезисы. Почему это главное прямо сейчас. Русский язык.`;
}
