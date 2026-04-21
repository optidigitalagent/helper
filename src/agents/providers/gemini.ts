import { ModelProvider } from '../types';

/**
 * Gemini provider stub.
 * Will become active once GEMINI_API_KEY is set and @google/generative-ai is installed.
 * API is OpenAI-compatible via https://generativelanguage.googleapis.com/v1beta/openai/
 */
export class GeminiProvider implements ModelProvider {
  name = 'gemini';

  isAvailable(): boolean {
    return !!process.env.GEMINI_API_KEY;
  }

  async call(_system: string, _user: string, _maxTokens = 800): Promise<string> {
    if (!this.isAvailable()) throw new Error('Gemini: GEMINI_API_KEY not set');
    // TODO: implement with @google/generative-ai or via OpenAI-compatible endpoint
    throw new Error('Gemini provider not yet implemented — add @google/generative-ai and implement here');
  }
}
