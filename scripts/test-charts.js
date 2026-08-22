// Run the browser-based chart visual tests. Kept out of scripts/test.js on purpose: these need a
// Playwright browser, and their reference screenshots are per-platform, so they are opt-in.
process.env.BABEL_ENV = 'test'
process.env.NODE_ENV = 'test'
process.env.DOTENV_CONFIG_QUIET = 'true'

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const argv = process.argv.slice(2)
if (process.env.CI && !argv.includes('--run')) argv.push('--run')

const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const result = spawnSync(process.execPath, [vitestCli, '--project=charts', ...argv], {
  stdio: 'inherit',
  env: process.env,
})

process.exit(result.status ?? (result.signal ? 1 : 0))
