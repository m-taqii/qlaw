import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ProviderConfig, LLMInput, LLMOutput, ProviderName } from "../types/index.js";

// Default baseURLs per provider 
const BASE_URLS: Partial<Record<ProviderName, string>> = {
    groq: 'https://api.groq.com/openai/v1',
    gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
    openrouter: 'https://openrouter.ai/api/v1',
    ollama: 'http://localhost:11434/v1',
    cerebras: 'https://api.cerebras.ai/v1',
    mistral: 'https://api.mistral.ai/v1',
}

const DEFAULT_MODELS: Partial<Record<ProviderName, string>> = {
    groq: 'llama-3.3-70b-versatile',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
    anthropic: 'claude-haiku-4-5-20251001',
    openrouter: 'meta-llama/llama-3.3-70b-instruct:free',
    ollama: 'llama3.2',
    cerebras: 'gpt-oss-120b',
    mistral: 'mistral-medium-3-5',
}

// Client factory 
function createClient(config: ProviderConfig): OpenAI | Anthropic {
    if (config.provider === 'anthropic') {
        return new Anthropic({ apiKey: config.apiKey })
    }

    return new OpenAI({
        apiKey: config.apiKey ?? 'no-key-needed', // ollama doesn't need a key
        baseURL: config.baseURL ?? BASE_URLS[config.provider],
    })
}

// LLM
export class LLM {
    private primaryConfig: ProviderConfig;
    private fallbackConfig?: ProviderConfig | undefined;

    private client: OpenAI | Anthropic;
    private fallbackClient?: OpenAI | Anthropic | undefined;
    private roundRobinProviders: ProviderConfig[] = [];
    private roundRobinClients: (OpenAI | Anthropic)[] = [];
    private roundRobinIndex: number = 0;
    private useRoundRobin: boolean = false;

    constructor(primaryConfig: ProviderConfig, fallbackConfig?: ProviderConfig, roundRobin?: ProviderConfig[]) {
        this.primaryConfig = primaryConfig;
        this.fallbackConfig = fallbackConfig;
        if (roundRobin && roundRobin.length > 0) {
            this.useRoundRobin = true
            this.roundRobinProviders = roundRobin
            this.roundRobinClients = roundRobin.map(c => createClient(c))
        }
        this.client = createClient(primaryConfig)
        if (fallbackConfig) {
            this.fallbackClient = createClient(fallbackConfig)
        }
    }

    async complete(input: LLMInput): Promise<LLMOutput> {
        if (this.useRoundRobin && this.roundRobinProviders.length > 0) {

            // try current provider
            const index = this.roundRobinIndex % this.roundRobinProviders.length
            const config = this.roundRobinProviders[index]!
            const client = this.roundRobinClients[index]!
            this.roundRobinIndex++

            try {
                return await this.callProvider(client, config, input)
            } catch (err: unknown) {
                const isRateLimit =
                    (err as { status?: number })?.status === 429 ||
                    String(err).toLowerCase().includes('rate')

                if (isRateLimit) {
                    // remove current provider from available pool temporarily
                    const available = this.roundRobinProviders
                        .map((p, i) => ({ p, i }))
                        .filter(({ i }) => i !== index)

                    if (available.length === 0) throw err

                    // pick randomly from remaining
                    const random = available[Math.floor(Math.random() * available.length)]!
                    console.warn(`👾 ${config.provider} rate limited — randomly switching to ${this.roundRobinProviders[random.i]!.provider}`)

                    return await this.callProvider(
                        this.roundRobinClients[random.i]!,
                        this.roundRobinProviders[random.i]!,
                        input
                    )
                }

                throw err
            }
        }
        try {
            return await this.callProvider(this.client, this.primaryConfig, input)
        } catch (err: unknown) {
            const isRateLimit =
                (err as { status?: number })?.status === 429 ||
                String(err).toLowerCase().includes('rate')

            if (isRateLimit && this.fallbackClient && this.fallbackConfig) {
                console.warn(`👾 ${this.primaryConfig.provider} rate limited — falling back to ${this.fallbackConfig.provider}`)
                return await this.callProvider(this.fallbackClient, this.fallbackConfig, input)
            }

            throw err
        }
    }

    private async callProvider(
        client: OpenAI | Anthropic,
        config: ProviderConfig,
        input: LLMInput
    ): Promise<LLMOutput> {
        const model = config.model ?? DEFAULT_MODELS[config.provider] ?? 'unknown-model'

        // Anthropic 
        if (client instanceof Anthropic) {
            const res = await client.messages.create({
                model,
                max_tokens: 2048,
                system: [{
                    type: 'text',
                    text: input.system,
                    cache_control: { type: 'ephemeral' }
                }],
                messages: input.messages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            })

            const block = res.content[0]
            if (!block || block.type !== 'text') {
                throw new Error('Anthropic returned empty response')
            }

            return {
                content: block.text,
                provider: config.provider,
                model,
            }
        }

        // OpenAI-compatible (Groq, Gemini, etc.)
        const res = await (client as OpenAI).chat.completions.create({
            model,
            temperature: 0.4,
            max_tokens: 2048,
            ...(input.jsonMode ? { response_format: { type: 'json_object' } } : {}),
            messages: [
                { role: 'system', content: input.system },
                ...input.messages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content,
                })),
            ],
        })

        const content = res.choices[0]?.message?.content
        if (!content) throw new Error(`${config.provider} returned empty response`)

        return {
            content,
            provider: config.provider,
            model,
        }
    }
}