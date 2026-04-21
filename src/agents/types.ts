// ─── Multi-Agent System — Core Interfaces ────────────────────────────────────

import { Category } from '../types';

// ── Model Provider ────────────────────────────────────────────────────────────

export interface ModelProvider {
  /** Unique identifier: 'openai' | 'claude' | 'gemini' | 'deepseek' */
  name: string;
  /** Returns true if the API key is configured and the provider can be called */
  isAvailable(): boolean;
  call(system: string, user: string, maxTokens?: number): Promise<string>;
}

// ── Agent Domain ──────────────────────────────────────────────────────────────

export type AgentDomain =
  | 'market'      // рынки, крипта, макро, геополитика
  | 'ai'          // AI-модели, инструменты, агенты, автоматизация
  | 'trends'      // слабые сигналы, emerging topics, новые направления
  | 'knowledge'   // deep knowledge, подкасты, статьи, идеи
  | 'goals'       // глобальные приоритеты, стратегические направления
  | 'philosophy'; // принципы, цитаты, мышление успешных людей

// ── Signal — one unit of data from a source ──────────────────────────────────

export interface AgentSignal {
  title:      string;
  url?:       string;
  content:    string;
  source:     string;
  score?:     number;
  timestamp?: Date;
  category?:  Category;
}

// ── Agent Output ──────────────────────────────────────────────────────────────

export interface AgentOutput {
  agentName:  string;
  domain:     AgentDomain;
  signals:    AgentSignal[];
  /** LLM-synthesized Telegram-ready markdown string */
  analysis:   string;
  confidence: 'high' | 'medium' | 'low';
  /** Which model produced this analysis */
  model:      string;
}

// ── Agent Interface ───────────────────────────────────────────────────────────

export interface Agent {
  name:   string;
  domain: AgentDomain;
  /** Fast keyword-based check — true if this agent is relevant to the query */
  canHandle(query: string): boolean;
  /** Pull signals from DB / external sources */
  gatherSignals(query: string): Promise<AgentSignal[]>;
  /** Run LLM analysis over gathered signals */
  analyze(signals: AgentSignal[], query: string, provider: ModelProvider): Promise<AgentOutput>;
}

// ── Orchestrator Request / Response ──────────────────────────────────────────

export interface OrchestratorRequest {
  query:              string;
  chatId?:            string | number;
  /** Override which providers to use; defaults to env-configured default */
  preferredProviders?: string[];
  /** If true — run 2 providers and compare answers */
  compareModels?:     boolean;
}

export interface OrchestratorResponse {
  query:           string;
  agentsUsed:      AgentDomain[];
  outputs:         AgentOutput[];
  /** Final merged Telegram-ready message */
  synthesis:       string;
  /** Present only if compareModels=true and >1 provider available */
  comparisonNote?: string;
}

// ── Comparison ────────────────────────────────────────────────────────────────

export interface ComparisonResult {
  answers:     { model: string; text: string }[];
  synthesis:   string;
  consistency: 'high' | 'medium' | 'low';
}
