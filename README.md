# 👾 Crawlix

[![npm version](https://badge.fury.io/js/crawlix.svg)](https://www.npmjs.com/package/crawlix)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/m-taqii/crawlix/pulls)

> Claw through bugs before your users do.

![Crawlix demo](https://github.com/user-attachments/assets/d7c9e046-2c84-4cc8-9549-81f2639cb6d1)

Crawlix is an open-source autonomous QA agent that spawns AI-powered user personas and unleashes them on your product. Each persona navigates independently, makes real decisions, hits dead ends, and finds bugs - without you writing a single test script.

It also ships with `crawlix generate` — a polyglot unit test generator that reads your source code and writes native test scripts for any language (Python, Rust, Go, TypeScript, and more).

---

## How it works

Crawlix spawns multiple AI agents simultaneously. Each one opens your app in a real browser, reads the UI, and navigates toward the goal exactly as that type of user would behave - including their mistakes, impatience, and confusion. When they find something broken, confusing, or unexpected - they report it.

```
  👾 Crawlix - Claw through bugs before your users do.

  target   → http://localhost:3000/
  goal     → Check the landing page is everything working fine
  agents   → First-Timer, Impatient, Power User, Adversarial, Non-Native Speaker, Slow Network

  ✓ First-Timer       2 critical · 3 warnings   18 steps · 12.3s
  ~ Impatient         1 warning                  6 steps  · 4.1s
  ✓ Power User        no findings                22 steps · 15.7s
  ✗ Adversarial       3 critical                 14 steps · 9.2s
  ~ Non-Native        106 warnings · 1 info      10 steps · 27.5s
  ~ Slow Network      no findings                4 steps  · 27.7s

  ╭──────────────────────────────────────────╮
  │  👾 Crawlix - run complete               │
  │                                          │
  │    1 critical  106 warnings  1 info      │
  │                                          │
  │    0 passed  0 stuck  6 incomplete       │
  │                                          │
  │    total time → 539.8s                   │
  ╰──────────────────────────────────────────╯

  📋 report saved → ./crawlix-reports/report-2026-05-24.md
```

No test scripts. No selectors. No maintenance.

---

## Install

```bash
npm install -g crawlix
```

---

## Setup

Run once. Crawlix asks for your LLM provider and API key - remembers it forever.

```bash
crawlix setup
```

During setup you can configure:
- A **primary** provider (required)
- A **fallback** provider — used automatically if the primary fails
- **Round robin** providers — load is spread across multiple providers to avoid rate limits

Config is saved to `~/.crawlix/crawlix.config.json`.

Supported providers:

| Provider | Notes |
|---|---|
| Groq | Fast inference, free tier available |
| Gemini | Google's models |
| Cerebras | Ultra-fast inference |
| Mistral | European models |
| OpenRouter | Access to 100+ models |
| Ollama | Fully local, no API key needed |
| OpenAI | GPT-4o and family |
| Anthropic | Claude models |
| Custom | Any OpenAI-compatible API |

---

## Project Context

You can provide Crawlix with context about your application so the agents can make smarter decisions.

Create a `CONTEXT.md` file inside a `.crawlix` folder at your project root:

```
your-project/
├── .crawlix/
│   └── CONTEXT.md
└── src/
    └── ...
```

Crawlix also looks for `CONTEXT.md` at the project root if `.crawlix/CONTEXT.md` doesn't exist.

Example `CONTEXT.md`:

```markdown
# My App Context

This is an e-commerce web app. Test the main checkout flow.

- Stack: Next.js, Postgres
- Auth: Required — use test@example.com / password123
- Off-limits: Do not delete user data or submit real orders
```

---

## Web Testing

```bash
# Run all built-in agents against your app
crawlix run --url https://myapp.com --goal "complete the signup flow"

# Run specific agent(s) only — comma separated
crawlix run --url https://myapp.com --goal "login" --agent first-timer,adversarial

# Run headed — watch agents navigate in a real browser window
crawlix run --url https://myapp.com --goal "checkout" --headed

# Control max steps per agent (default: 100)
crawlix run --url https://myapp.com --goal "find pricing" --steps 15

# Control how many agents run in parallel (default: 2)
crawlix run --url https://myapp.com --goal "test signup" --concurrency 1

# Spread load across multiple providers to avoid rate limiting
crawlix run --url https://myapp.com --goal "test signup" --round-robin

# List all available agents
crawlix agents

# reconfigure your LLM provider
crawlix setup
```

---

## Built-in Agents

| Agent | Behavior |
|---|---|
| `first-timer` | Never seen this app. Reads everything carefully. Gets lost easily, clicks whatever looks obvious. |
| `impatient` | Skips everything. Rage-clicks. Abandons if stuck for more than 2 steps. |
| `power-user` | Tries every edge case, advanced flow, keyboard shortcut, and boundary condition. |
| `adversarial` | SQL injection, XSS attempts, malformed inputs, broken sequences, ID tampering. |
| `non-native` | Misreads labels, confused by jargon and idioms. Tests copy clarity ruthlessly. |
| `slow-network` | Throttled connection. Finds missing loading states and timeout issues. |

---

## Custom Agents

Drop a JSON file into `.crawlix/agents/` in your project root:

```json
{
  "name": "doctor",
  "description": "Medical professional, time-pressured, technically literate",
  "systemPrompt": "You are a busy doctor with 2 minutes between patients. You know what you want, you don't read instructions, and you get frustrated fast if the UI isn't obvious.",
  "patience": 4,
  "aggression": 3,
  "readingBehavior": "skim"
}
```

Crawlix picks it up automatically on the next run. No code, no imports, no build step.

```bash
crawlix run --url https://myapp.com --goal "book an appointment" --agent doctor
```

Valid `readingBehavior` values: `thorough`, `skim`, `skip`.

---

## Reports

After every run, Crawlix generates an AI-powered markdown report saved to `./crawlix-reports/`.

The report includes:
- Executive summary
- Critical issues with suggested fixes
- Warning patterns across agents
- Agent performance breakdown
- Prioritized recommendations

---

## Findings

Crawlix reports three severity levels:

| Severity | Meaning |
|---|---|
| `critical` | Broken element, crash, security issue, complete blocker |
| `warning` | Confusing flow, missing feedback, slow response, unclear copy |
| `info` | Minor friction, accessibility gap, copy improvement |

---

## Unit Test Generation

Crawlix can also analyze your source code and generate native unit tests for any language.

```bash
# Analyze specific files — generates the right test framework automatically
crawlix generate src/api.py src/utils.py --out ./tests

# Pass multiple paths (files or directories)
crawlix generate src/lib/ src/api.ts --out ./tests

# Scan the entire repository (requires interactive confirmation due to token usage)
crawlix generate --full-scan --out ./tests

# Use round robin providers to spread the analysis load
crawlix generate src/api.py --round-robin --out ./tests
```

Crawlix automatically detects the language and picks the right framework:

| Language | Framework |
|---|---|
| Python | `pytest` |
| Rust | `cargo test` |
| Go | `go test` |
| TypeScript / JavaScript | `vitest` / `jest` |

**Smart Dependencies:** Crawlix dynamically detects your package manager (via lockfiles like `pnpm-lock.yaml` or `uv.lock`) and automatically prompts you to install the exact test framework dependencies needed for the generated tests.

**Token safety:** Crawlix automatically ignores common heavy folders (`node_modules`, `venv`, `target`, `.next`, `__pycache__`) and binary files. It also fully respects your project's `.gitignore` rules — so gitignored files are never sent to the LLM.

The `--full-scan` flag will prompt you to confirm before it reads the entire repository:

```
⚠️  WARNING: You are about to scan the entire repository.
This will read all text files in the project and may consume a large amount of LLM tokens.
? Are you sure you want to continue with a full scan? (y/N)
```

---

## Why no test scripts for web testing?

Traditional QA tools require you to write and maintain selectors, flows, and assertions. They break when your UI changes. They only test paths you already thought of.

Crawlix's web agents don't know your app. That's the point. They find the paths you didn't think of — the ones your real users will find on their own.

For backend and non-web code, Crawlix takes the opposite approach: use `crawlix generate` to have the AI read your source and write the unit tests for you.

---

## Roadmap

- [x] Web testing (Playwright)
- [x] AI-generated reports
- [x] Custom agents via JSON
- [x] Unit test generation (polyglot)
- [ ] API testing (no UI)
- [ ] Mobile testing (Appium)
- [ ] Desktop testing (Electron / WinAppDriver)
- [ ] CI/CD integration (GitHub Actions)
- [ ] HTML report export

---

## Contributing

Contributions are welcome - bug fixes, new agents, adapter improvements, or anything that makes it better. 
Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

---

## License

MIT - see [LICENSE](LICENSE)
