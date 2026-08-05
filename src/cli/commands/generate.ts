import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { confirm } from '@inquirer/prompts';

import { getConfig } from '../../lib/getConfigs.js';
import { LLM } from '../../llm/index.js';
import { analyzeAndGenerateTests } from '../../core/analyzer.js';

export const generateCommand = new Command('generate')
    .description('Analyze project and generate native unit tests')
    .argument('[targets...]', 'Files or directories to analyze')
    .option('--out <dir>', 'Output directory for generated tests', './tests')
    .option('--full-scan', 'Scan the entire repository (requires confirmation)')
    .option('--round-robin', 'Spread load across multiple providers')
    .action(async (targets: string[], options) => {
        if (targets.length === 0 && !options.fullScan) {
            console.error(chalk.red('\nError: No files specified to analyze.'));
            console.log(chalk.yellow('Either provide specific files:'));
            console.log(chalk.cyan('  crawlix generate src/api.py src/utils.py'));
            console.log(chalk.yellow('\nOr use the --full-scan flag to analyze the entire repository:'));
            console.log(chalk.cyan('  crawlix generate --full-scan\n'));
            process.exit(1);
        }

        let scanTargets = targets;
        if (options.fullScan) {
            console.log(chalk.yellow('\n⚠️  WARNING: You are about to scan the entire repository.'));
            console.log(chalk.gray('This will read all text files in the project and may consume a large amount of LLM tokens.'));

            const proceed = await confirm({ message: 'Are you sure you want to continue with a full scan?', default: false });
            if (!proceed) {
                console.log(chalk.gray('Aborted full scan.'));
                process.exit(0);
            }

            if (scanTargets.length === 0) {
                scanTargets = ['.']; // Default to current directory if no specific targets provided but full-scan is true
            }
        }

        const config = getConfig();
        if (options.roundRobin && !config.roundRobin?.length) {
            console.warn(chalk.yellow('  ⚠ --round-robin flag used but no round robin providers configured.'));
        }

        const llm = new LLM(config.primary, config.fallback, options.roundRobin ? config.roundRobin : undefined);
        const spinner = ora({ text: chalk.gray('Analyzing codebase and generating tests...'), spinner: 'dots' }).start();

        try {
            const tests = await analyzeAndGenerateTests(scanTargets, llm);

            if (tests.length === 0) {
                spinner.warn(chalk.yellow('Analysis complete, but no tests were generated.'));
                return;
            }

            if (!fs.existsSync(options.out)) {
                fs.mkdirSync(options.out, { recursive: true });
            }

            for (const test of tests) {
                const outPath = path.join(options.out, test.filename);
                // Ensure directory for this specific test file exists
                const dir = path.dirname(outPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(outPath, test.content, 'utf-8');
            }

            spinner.succeed(chalk.green(`Successfully generated ${tests.length} test script(s) in ${options.out}/`));
            for (const test of tests) {
                console.log(chalk.cyan(`  - ${path.join(options.out, test.filename)}`));
            }

            // Collect unique, non-empty install commands from the LLM output
            const installCommands = [...new Set(
                tests.map(t => t.installCommand?.trim()).filter((cmd): cmd is string => !!cmd)
            )];

            if (installCommands.length > 0) {
                console.log('');
                console.log(chalk.yellow('  ⚠  The generated tests require additional dependencies.'));
                for (const cmd of installCommands) {
                    console.log(chalk.gray(`     ${cmd}`));
                }
                console.log('');

                const shouldInstall = await confirm({ message: 'Install them now?', default: true });

                if (shouldInstall) {
                    for (const cmd of installCommands) {
                        console.log(chalk.gray(`  Running: ${cmd}`));
                        try {
                            execSync(cmd, { stdio: 'inherit', cwd: process.cwd() });
                        } catch {
                            console.log(chalk.red(`  ✗ Failed. Run manually: ${cmd}`));
                        }
                    }
                    console.log(chalk.green('  ✓ Done.'));
                } else {
                    for (const cmd of installCommands) {
                        console.log(chalk.gray(`  Run manually: ${cmd}`));
                    }
                }
            }

        } catch (err: unknown) {
            spinner.fail(chalk.red(`Failed to generate tests: ${err instanceof Error ? err.message : String(err)}`));
            process.exit(1);
        }
    });
