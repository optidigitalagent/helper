import OpenAI from 'openai';
import { ModelProvider } from '../types';

export class OpenAIProvider implements ModelProvider {
  name = 'openai';
  private model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async call(system: string, user: string, maxTokens = 800): Promise<string> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const res = await client.chat.completions.create({
      model:       this.model,
      temperature: 0.1,
      max_tokens:  maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
    });
    return res.choices[0]?.message?.content ?? '';
  }
}
