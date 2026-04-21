import { ModelProvider } from '../types';

/**
 * DeepSeek provider stub.
 * DeepSeek API is OpenAI-compatible: https://api.deepseek.com/v1
 * Will become active once DEEPSEEK_API_KEY is set.
 */
export class DeepSeekProvider implements ModelProvider {
  name = 'deepseek';

  isAvailable(): boolean {
    return !!process.env.DEEPSEEK_API_KEY;
  }

  async call(_system: string, _user: string, _maxTokens = 800): Promise<string> {
    if (!this.isAvailable()) throw new Error('DeepSeek: DEEPSEEK_API_KEY not set');
    // TODO: use openai client with baseURL='https://api.deepseek.com/v1' and model='deepseek-chat'
    throw new Error('DeepSeek provider not yet implemented — set DEEPSEEK_API_KEY and implement here');
  }
}
