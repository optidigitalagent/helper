import { BaseAgent } from './base';
import { AgentDomain } from '../types';
import { Category } from '../../types';

export class PhilosophyAgent extends BaseAgent {
  name   = 'PhilosophyAgent';
  domain: AgentDomain = 'philosophy';

  protected categories = [Category.Thinking, Category.Podcast, Category.Learning];

  protected keywords = /философ|цитат|мышлени|принцип|мудрост|жизн|смысл|стоиц|сенека|аврелий|мангер|баффет|далио|талеб|mindset|wisdom|principle|quote|мысль|framework|успешн|великих/i;

  protected systemPrompt = `Ты — куратор философии и мышления. Только сильные идеи, принципы и цитаты.
Авторы: Мангер, Баффет, Сенека, Марк Аврелий, Далио, Талеб, Безос, Грэм и подобные.
НЕ про AI, крипту, технологии — только вечные темы: бизнес, жизнь, деньги, решения, люди.
Формат (Telegram Markdown): цитата в кавычках → имя автора → почему актуально прямо сейчас.
Только реально сильные мысли. Без банальностей. Русский язык.`;
}
