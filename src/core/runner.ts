import type { Adapter } from "../adapters/base.js"
import type { Finding, HistoryEntry, RunResult } from "../types/index.js"
import type { Director } from "./director.js"

export class Runner {
  private adapter: Adapter;
  private director: Director;
  private url: string;
  private goal: string;
  private maxSteps: number;

  constructor(adapter: Adapter, director: Director, url: string, goal: string, maxSteps = 25) {
    this.adapter = adapter;
    this.director = director;
    this.url = url;
    this.goal = goal;
    this.maxSteps = maxSteps;
  }

  async run(): Promise<RunResult> {
    // 1. open the url
    const history: HistoryEntry[] = []
    const findings: Finding[] = []
    const startedAt = Date.now()

    try {
      await this.adapter.open(this.url)

      // 2. loop
      for (let step = 1; step <= this.maxSteps; step++) {

        // get current state
        const pageState = await this.adapter.getState()

        // ask director what to do
        const action = await this.director.decide(pageState, history)

        // record finding if any
        if (action.finding) findings.push({ ...action.finding, step })

        // stop if done or stuck
        if (action.type === 'done' || action.type === 'stuck') break

        // execute the action
        const result = await this.adapter.execute(action)

        // record in history with execution result
        history.push({ step, pageState, action, succeeded: result.success, error: result.error })

        // if action failed record it as a finding too
        if (!result.success) {
          findings.push({
            severity: 'warning',
            description: `Action failed: ${result.error ?? 'Unknown error'}`,
            element: action.target ?? undefined,
            step,
          })
        }
      }
    } catch (err: unknown) {
      findings.push({
        severity: 'critical',
        description: `Agent crashed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
        step: history.length + 1
      })
    } finally {
      // 3. close and return
      await this.adapter.close().catch(() => { })
    }

    return {
      persona: this.director.personaName,
      url: this.url,
      goal: this.goal,
      steps: history.length,
      findings,
      goalReached: history.at(-1)?.action.type === 'done',
      stuck: history.at(-1)?.action.type === 'stuck' || (findings.length > 0 && findings[findings.length - 1]?.description.startsWith('Agent crashed unexpectedly') === true),
      duration: Date.now() - startedAt,
      history,
    }
  }
}