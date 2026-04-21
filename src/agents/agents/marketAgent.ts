import { BaseAgent } from './base';
import { AgentDomain } from '../types';
import { Category } from '../../types';

export class MarketAgent extends BaseAgent {
  name   = 'MarketAgent';
  domain: AgentDomain = 'market';

  protected categories = [Category.MarketSignals, Category.Crypto, Category.Macro];

  protected keywords = /рынок|крипт|макро|биткоин|btc|eth|акц|nasdaq|s&p|фрс|фед|инфляц|gdp|ввп|рецесс|ставк|геополит|санкц|нефт|золото|dollar|доллар|market|stock|crypto|macro|fed|rate|inflation/i;

  protected systemPrompt = `Ты — аналитик рынков. Специализация: макроэкономика, крипта, фондовый рынок, геополитика.
Анализируй только то, что реально влияет на капитал и бизнес-решения. Игнорируй шум и хайп.
Формат (Telegram Markdown): ключевые сигналы с объяснением почему важно и что ожидать.
Ссылки инлайн **[Заголовок](url)** если есть в данных. Русский язык. Без воды.`;
}
