import fs from 'fs';
import path from 'path';
import ignore, { type Ignore } from 'ignore';
import type { LLM } from '../llm/index.js';
import { getContext } from '../lib/getContext.js';
import chalk from 'chalk';

const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    'build',
    'target',
    'venv',
    '.venv',
    '__pycache__',
    '.next',
    'coverage',
    '.svelte-kit'
]);

const IGNORED_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
    '.mp4', '.webm', '.ogg', '.mp3', '.wav',
    '.woff', '.woff2', '.ttf', '.eot',
    '.pdf', '.zip', '.tar', '.gz',
    '.exe', '.dll', '.so', '.dylib', '.bin'
]);

function walkDir(dir: string, fileList: string[] = [], ig?: Ignore): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        
        if (ig) {
            const relPath = path.relative(process.cwd(), filePath);
            const posixPath = relPath.split(path.sep).join('/');
            if (posixPath && ig.ignores(posixPath)) {
                continue;
            }
        }

        if (fs.statSync(filePath).isDirectory()) {
            if (!IGNORED_DIRS.has(file)) {
                walkDir(filePath, fileList, ig);
            }
        } else {
            const ext = path.extname(file).toLowerCase();
            if (!IGNORED_EXTS.has(ext)) {
                fileList.push(filePath);
            }
        }
    }
    return fileList;
}

/**
 * Scan the project root for lock files and pass their names to the LLM.
 * The LLM knows what each lock file corresponds to.
 */
function detectLockFiles(): string {
    const cwd = process.cwd();
    const knownLockFiles = [
        'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', 'bun.lock', 'package-lock.json',
        'uv.lock', 'poetry.lock', 'Pipfile.lock', 'requirements.txt',
        'Cargo.lock', 'go.sum', 'composer.lock', 'Gemfile.lock',
    ];

    const found = knownLockFiles.filter(f => fs.existsSync(path.join(cwd, f)));

    return found.length > 0
        ? `The following lock files were found in the project root: ${found.join(', ')}. Use these to determine the correct package manager for the installCommand.`
        : 'No lock files were found in the project root.';
}

export async function analyzeAndGenerateTests(
    targets: string[],
    llm: LLM
): Promise<{ filename: string, content: string, installCommand?: string }[]> {
    const allFiles: string[] = [];

    let ig: Ignore | undefined;
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        ig = ignore().add(fs.readFileSync(gitignorePath, 'utf8'));
    }

    for (const target of targets) {
        if (!fs.existsSync(target)) {
            console.warn(`Warning: Target path does not exist: ${target}`);
            continue;
        }
        if (fs.statSync(target).isDirectory()) {
            walkDir(target, allFiles, ig);
        } else {
            if (ig) {
                const relPath = path.relative(process.cwd(), target).split(path.sep).join('/');
                if (relPath && ig.ignores(relPath)) {
                    console.log(chalk.gray(`⚠ Skipping gitignored file: ${target}`));
                    continue; // Skip if explicitly targeted but gitignored
                }
            }
            allFiles.push(target);
        }
    }

    if (allFiles.length === 0) {
        throw new Error("No valid files found to analyze.");
    }

    const fileContents: string[] = [];
    for (const file of allFiles) {
        try {
            const content = fs.readFileSync(file, 'utf-8');
            fileContents.push(`--- File: ${file} ---\n\`\`\`\n${content}\n\`\`\`\n`);
        } catch (err) {
            console.warn(`Warning: Could not read file ${file}`);
        }
    }

    const appContext = getContext();
    const contextBlock = appContext ? `\n# Application Context\n${appContext}\n` : '';
    const packageManagerInfo = detectLockFiles();

    const systemPrompt = `You are a Senior Polyglot Test Engineer.
Your task is to analyze the provided source code files and generate robust, native unit tests for them.

# Package Manager Context
${packageManagerInfo}
Always use this exact package manager in the installCommand field. Do not suggest a different one.

# Instructions
1. Analyze the language of the source code.
2. Write unit tests using the standard testing framework for that language (e.g., pytest for Python, cargo test for Rust, go test for Go, Jest/Vitest for TS/JS).
3. Output the tests as a JSON object containing an array of files to create.
4. ONLY output valid JSON. Do not include markdown code blocks or explanations outside the JSON.
5. The "installCommand" field is REQUIRED in every test object. It MUST always be present. Set it to the exact shell command to install the specific test framework packages used (e.g. "pnpm add -D jest @jest/globals ts-jest", NOT a generic "pnpm install"). If no external dependencies are needed, set it to an empty string "".

# Output Format
{
  "tests": [
    {
      "filename": "appropriate_test_filename_for_language",
      "content": "the full test script content",
      "installCommand": "(REQUIRED) exact shell command to install test dependencies, or empty string if none needed"
    }
  ]
}`;

    const userPrompt = `Here is the codebase to analyze:
${contextBlock}
# Source Files
${fileContents.join('\n')}`;

    const res = await llm.complete({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        jsonMode: true,
    });

    try {
        const cleaned = res.content
            .replace(/^```(?:json)?\n?/m, '')
            .replace(/\n?```$/m, '')
            .trim();
        const parsed = JSON.parse(cleaned);
        return parsed.tests || [];
    } catch (err) {
        throw new Error(`Failed to parse LLM output as JSON: ${err instanceof Error ? err.message : String(err)}\n\nOutput was: ${res.content}`);
    }
}
