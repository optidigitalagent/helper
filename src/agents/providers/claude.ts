import Anthropic from '@anthropic-ai/sdk';
import { ModelProvider } from '../types';

export class ClaudeProvider implements ModelProvider {
  name = 'claude';
  private model = process.env.CLAUDE_MODEL ?? 'claude-3-5-haiku-20241022';

  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  async call(system: string, user: string, maxTokens = 800): Promise<string> {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const res = await client.messages.create({
      model:      this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const block = res.content[0];
    return block.type === 'text' ? block.text : '';
  }
}
