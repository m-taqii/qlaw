import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';

import { Orchestrator } from '../../core/orchestrator.js';
import { LLM } from '../../llm/index.js';
import { loadPersonas } from '../../personas/loader.js';
import { getConfig } from '../../lib/getConfigs.js';
import { agentDone, agentStarted, printFinding, printHeader, printSummary } from '../../lib/display.js';
import { generateReport, saveReport } from "../../core/reporter.js";

export const runCommand = new Command('run')
    .description('Run AI agents against your app')
    .requiredOption('--url <url>', 'URL to test')
    .requiredOption('--goal <goal>', 'What to achieve')
    .option('--agent <agents>', 'Specific agent(s) to run, comma separated')
    .option('--steps <number>', 'Max steps per agent', '100')
    .option('--concurrency <number>', 'Agents running in parallel', '2')
    .option('--headed', 'Run browser in headed mode')
    .option('--round-robin', 'Spread load across multiple providers to avoid rate limiting')
    .action(async (options) => {
        const config = getConfig();
        if (options.roundRobin && !config.roundRobin?.length) {
            console.warn(chalk.yellow('  ⚠ --round-robin flag used but no round robin providers configured. Run crawlix setup to add them.'))
        }
        const llm: LLM = new LLM(config.primary, config.fallback, options.roundRobin ? config.roundRobin : undefined);

        const { url, goal, agent, steps, concurrency, headed } = options;

        const personas = await loadPersonas(agent);
        printHeader(url, goal, personas.map(p => p.name));

        const orchestrator = new Orchestrator({
            url,
            goal,
            llm,
            personas,
            maxSteps: parseInt(steps),
            concurrency: parseInt(concurrency),
            headless: !headed,
            onAgentStart: (name) => agentStarted(name),
            onAgentDone: (result) => {
                agentDone(result)
                result.findings.forEach(f => printFinding(f, result.persona))
            }
        });
        const results = await orchestrator.run();
        printSummary(results);

        const reportSpinner = ora({ text: chalk.gray('generating report...'), spinner: 'dots' }).start();

        try {
            const { title, report } = await generateReport(results, url, goal, llm);
            const filepath = saveReport(title, report);
            reportSpinner.stopAndPersist({ symbol: '📋', text: chalk.gray('report saved → ') + chalk.white(filepath) });
        } catch (err: unknown) {
            reportSpinner.fail(chalk.red(`Failed to generate report: ${err instanceof Error ? err.message : String(err)}`));
        }
    })