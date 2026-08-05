#!/usr/bin/env node

import { Command } from 'commander'
import { runCommand } from './commands/run.js'
import { setupCommand } from './commands/setup.js'
import { agentsCommand } from './commands/agents.js'
import { generateCommand } from './commands/generate.js'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json') as { version: string }
const program = new Command()

program
    .name('crawlix')
    .description('👾 Crawlix: Claw through bugs before your users do.')
    .version(pkg.version)

program.addCommand(runCommand)
program.addCommand(setupCommand)
program.addCommand(agentsCommand)
program.addCommand(generateCommand)

program.parse()