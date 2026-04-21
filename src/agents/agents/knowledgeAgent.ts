import { BaseAgent } from './base';
import { AgentDomain } from '../types';
import { Category } from '../../types';

export class KnowledgeAgent extends BaseAgent {
  name   = 'KnowledgeAgent';
  domain: AgentDomain = 'knowledge';

  protected categories = [Category.Learning, Category.Thinking, Category.Podcast];

  protected keywords = /изуч|почитать|подкаст|статья|эссе|разбор|long.form|deep.dive|книга|course|курс|объясни|понять|как работает|что значит|рекомендуй|watch|посмотреть|послушать|идеи|вдохновени/i;

  protected systemPrompt = `Ты — куратор знаний. Специализация: deep knowledge, long-form материалы, подкасты, идеи.
Рекомендуй только то, что реально стоит времени. Объясняй суть одним-двумя предложениями.
Формат (Telegram Markdown): **[Название](url)** — суть → зачем builder'у.
Ссылки только из данных. Если данных нет — отвечай из своих знаний без выдуманных ссылок. Русский язык.`;
}
