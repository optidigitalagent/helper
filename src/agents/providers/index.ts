import { ModelProvider } from '../types';
import { OpenAIProvider }   from './openai';
import { ClaudeProvider }   from './claude';
import { GeminiProvider }   from './gemini';
import { DeepSeekProvider } from './deepseek';

// Registration order = priority when no explicit preference is set
const ALL_PROVIDERS: ModelProvider[] = [
  new OpenAIProvider(),
  new ClaudeProvider(),
  new GeminiProvider(),
  new DeepSeekProvider(),
];

/** Returns the provider matching LLM_PROVIDER env var, or first available fallback */
export function getDefaultProvider(): ModelProvider {
  const preferred = process.env.LLM_PROVIDER ?? 'openai';
  const found = ALL_PROVIDERS.find(p => p.name === preferred && p.isAvailable());
  if (found) return found;
  const fallback = ALL_PROVIDERS.find(p => p.isAvailable());
  if (fallback) return fallback;
  throw new Error('No LLM provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.');
}

/** Returns a specific provider by name — throws if unavailable */
export function getProvider(name: string): ModelProvider {
  const provider = ALL_PROVIDERS.find(p => p.name === name);
  if (!provider) throw new Error(`Unknown provider: "${name}". Available: ${ALL_PROVIDERS.map(p => p.name).join(', ')}`);
  if (!provider.isAvailable()) throw new Error(`Provider "${name}" is not configured (missing API key)`);
  return provider;
}

/** Returns all providers that have API keys configured */
export function getAvailableProviders(): ModelProvider[] {
  return ALL_PROVIDERS.filter(p => p.isAvailable());
}

export { OpenAIProvider, ClaudeProvider, GeminiProvider, DeepSeekProvider };
