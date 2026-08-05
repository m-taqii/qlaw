import type { Action, HistoryEntry, LLMInput, PageState, PersonaConfig } from "../types/index.js";
import { LLM } from "../llm/index.js";
import { getContext } from "../lib/getContext.js";

export class Director {
    private persona: PersonaConfig;
    private llm: LLM;
    private goal: string;
    private context?: string | undefined;

    constructor(persona: PersonaConfig, llm: LLM, goal: string) {
        this.persona = persona;
        this.llm = llm;
        this.context = getContext();
        this.goal = goal;
    }

    get personaName(): string {
        return this.persona.name;
    }

    // build context block For Application Context
    private buildContextBlock(): string {
        if (!this.context) return '';
        return `APPLICATION CONTEXT:\n${this.context}\n`;
    }

    // build system prompt
    private buildSystemPrompt(): string {

        return `You are an autonomous QA agent embodying the following user persona.

${this.context ? this.buildContextBlock() : ''}

PERSONA: ${this.persona.name}
DESCRIPTION: ${this.persona.description}
GOAL: ${this.goal}

BEHAVIOR:
${this.persona.systemPrompt}

BEHAVIORAL MODIFIERS:
- Patience level: ${this.persona.patience}/10 — ${this.persona.patience <= 3 ? 'give up quickly if stuck' : this.persona.patience >= 8 ? 'persist through difficulties' : 'try a few times before giving up'}
- Aggression level: ${this.persona.aggression}/10 — ${this.persona.aggression >= 8 ? 'actively try to break things' : this.persona.aggression <= 2 ? 'interact gently and carefully' : 'interact normally'}
- Reading behavior: ${this.persona.readingBehavior === 'thorough' ? 'read everything on the page before acting' : this.persona.readingBehavior === 'skim' ? 'skim text quickly, catch main points only' : 'skip all text, act on visual cues only'}

RESPONSE RULES:
"target": "use ONLY the visible label text of the element, nothing else. 
Not the index number, not the role. Just the text. 
Example: 'Sign Up' not '[01] button Sign Up'"
"data entry": "When filling out forms, always use 'crawlix@gmail.com' for emails, 'crawlix' for names, and 'password123' for passwords."
"account state": "If you already registered, DO NOT try to register again. If you end up logged out, find the 'Log In' button and log in with those same credentials instead."
You must always respond with valid JSON only. No explanation outside JSON.

{
  "type": "open" | "click" | "type" | "scroll" | "select" | "hover" | "press" | "wait" | "done" | "stuck",
  "target": "element description",
  "value": "text to type / key to press / scroll direction / url to open",
  "reasoning": "one sentence why",
  "finding": {
    "severity": "critical" | "warning" | "info",
    "description": "what you observed",
    "element": "which element"
  }
}

Set "finding" to null if nothing notable this step.
Set "type" to "done" only when goal is fully complete.
Set "type" to "stuck" only after ${this.persona.patience <= 3 ? '2' : this.persona.patience <= 6 ? '3' : '4'} failed attempts on the same step.`
    }

    // build user message with history and page Elementa
    private buildUserMessage(pageState: PageState, history: HistoryEntry[]): string {
        const header = [
            pageState.url ? `Current URL: ${pageState.url}` : null,
            pageState.title ? `Current Title: ${pageState.title}` : null,
        ].filter(Boolean).join('\n')

        // build history text to pass to the LLM in user message ( last 5 entries )
        const historyText = history.length === 0
            ? 'No actions yet — this is your first step.'
            : history.slice(-5).map(e => {
                const status = e.succeeded ? '✓' : `✗ FAILED: ${e.error}`
                return (
                    `[${String(e.step).padStart(2, '0')}] ${e.action.type.toUpperCase().padEnd(8)} ` +
                    `${e.action.target ?? '—'} ` +
                    `${e.action.value ? `"${e.action.value}"` : ''} ` +
                    `→ ${status}` + `\n` + `Reasoning: ${e.action.reasoning}` + `\n` +
                    (e.action.finding ? ` ⚠ ${e.action.finding.severity.toUpperCase()}: ${e.action.finding.description}` : '')
                )
            }).join('\n')
        const lastAction = history.at(-1)
        const lastActionHint = lastAction?.action.type === 'type'
            ? `\nHINT: You just typed "${lastAction.action.value}" into "${lastAction.action.target}" — you must now submit by pressing Enter or clicking the submit/search button.`
            : ''

        return [
            header,
            lastActionHint,
            '',
            '── PAGE ELEMENTS ──────────────────────────',
            pageState.tree,
            '',
            '── HISTORY ────────────────────────────────',
            historyText,
            '',
            'What is your next action?',
        ].join('\n')
    }

    // parse LLM response for next action
    private parseAction(raw: string): Action {
        const cleaned = raw
            .replace(/^```(?:json)?\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim()

        let parsed: Record<string, unknown>
        try {
            parsed = JSON.parse(cleaned)
        } catch {
            throw new Error(`Crawlix: received non-JSON response:\n${raw}`)
        }
        if (Array.isArray(parsed)) {
            parsed = parsed[0] as Record<string, unknown>
        }
        if (!parsed['type'] || typeof parsed['type'] !== 'string') {
            throw new Error(`Crawlix: missing "type" in response:\n${raw}`)
        }
        if (!parsed['reasoning'] || typeof parsed['reasoning'] !== 'string') {
            throw new Error(`Crawlix: missing "reasoning" in response:\n${raw}`)
        }

        return parsed as unknown as Action
    }

    // call LLM for Next Action
    public async decide(pageState: PageState, history: HistoryEntry[]): Promise<Action> {
        const input: LLMInput = {
            system: this.buildSystemPrompt(),
            messages: [{ role: 'user', content: this.buildUserMessage(pageState, history) }],
            jsonMode: true,
        }

        const response = await this.llm.complete(input)
        return this.parseAction(response.content)
    }
}