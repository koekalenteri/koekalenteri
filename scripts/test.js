// Run backend + frontend Vitest projects in parallel processes.
//
// This script forwards any CLI filters (e.g. `npm test http`) to *both* test runners,
// ensures that filters that match zero tests do not fail the overall command, and is
// intentionally *non-watch* (it forces --run for the children). It deliberately does NOT force
// CI=true to get that: vitest.config.mts caps maxWorkers at 2 whenever CI is set, which is the
// right call for actual CI runners but would needlessly throttle a local machine's cores every
// time this script runs -- including from the pre-commit hook, where it matters most.

const { spawn } = require('node:child_process')

const args = process.argv.slice(2).map((arg) => (arg === '--onlyChanged' ? '--changed' : arg))
if (!args.includes('--run')) args.push('--run')

const spawnNode = (script, extraEnv = {}) =>
  spawn(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })

const children = [
  spawnNode(require.resolve('./test-backend.js'), { DOTENV_CONFIG_QUIET: 'true' }),
  spawnNode(require.resolve('./test-frontend.js')),
]

let exitCode = 0

children.forEach((child) => {
  child.on('exit', (code, signal) => {
    // Collect exit codes.
    if (typeof code === 'number' && code !== 0) exitCode = code
    if (signal) exitCode = exitCode || 1

    // If all children have exited, exit with the worst code.
    if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) {
      process.exit(exitCode)
    }
  })
})

// Propagate termination signals so Ctrl-C stops both Vitest processes.
;['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    children.forEach((c) => c.kill(sig))
  })
})
