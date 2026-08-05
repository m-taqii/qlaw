//  Crawlix — Types

// Actions 
export type ActionType = | 'open' | 'click' | 'type' | 'scroll' | 'select' | 'hover' | 'press' | 'wait' | 'done' | 'stuck'

export interface Action {
  type: ActionType
  target?: string    // element description e.g. "Submit button"
  value?: string   // text to type, url, key to press, scroll direction
  reasoning: string   // why this action — one sentence
  finding?: Finding  // bug or issue spotted at this step
}

export interface ActionResult {
  success: boolean
  error?: string
}

// Findings 
export interface Finding {
  severity: 'critical' | 'warning' | 'info'
  description: string
  element?: string | undefined
  screenshot?: string  // path - attached by runner
  step?: number
}

// Page State 
export interface PageState {
  url?: string   // undefined for native apps
  title?: string | undefined
  tree: string   // extracted UI elements as text
  timestamp: number
}

// History 
export interface HistoryEntry {
  step: number
  pageState: PageState
  action: Action
  succeeded: boolean
  error?: string | undefined
}

// User Persona for Ai Tester
export interface PersonaConfig {
  name: string
  description: string
  systemPrompt: string
  patience: number   // 1-10: how long before giving up
  aggression: number   // 1-10: how destructive
  readingBehavior: 'thorough' | 'skim' | 'skip'
  maxSteps?: number   // optional override, derived from patience if not set
}

export type ProviderName = | 'groq' | 'openai' | 'anthropic' | 'gemini' | 'openrouter' | 'ollama' | 'cerebras' | 'mistral' | 'custom';

export interface ProviderConfig {
  provider: ProviderName
  apiKey?: string
  model?: string
  baseURL?: string
}

export interface LLMInput {
  system: string
  messages: LLMMessage[]
  jsonMode?: boolean
}

export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMOutput {
  content: string
  provider: ProviderName
  model: string
}

// Crawlix Config (saved at ~/.crawlix/crawlix.config.json) 
export interface CrawlixConfig {
  primary: ProviderConfig
  fallback?: ProviderConfig
  roundRobin?: ProviderConfig[]
}

// Run Result 
export interface RunResult {
  persona: string
  url: string
  goal: string
  steps: number
  findings: Finding[]
  goalReached: boolean
  stuck: boolean
  duration: number      // ms
  history: HistoryEntry[]
}
