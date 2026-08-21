// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'test'
process.env.NODE_ENV = 'test'
process.env.DOTENV_CONFIG_QUIET = 'true'

// Ensure environment variables are read.
require('../config/env')

const { spawnSync } = require('node:child_process')
const path = require('node:path')
const argv = process.argv.slice(2).filter((arg) => arg !== '--runTestsByPath')

if (process.env.CI && !argv.includes('--run')) argv.push('--run')

const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const result = spawnSync(process.execPath, [vitestCli, '--project=backend', ...argv], {
  stdio: 'inherit',
  env: process.env,
})

process.exit(result.status ?? (result.signal ? 1 : 0))
