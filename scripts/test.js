// Run backend + frontend test suites as separate Jest processes.
//
// Motivation:
// - Backend needs NODE_OPTIONS=--experimental-vm-modules for ESM support.
// - Frontend breaks under that flag (e.g. CJS/ESM interop issues in deps like notistack).
//
// This script forwards any CLI filters (e.g. `npm test http`) to *both* test runners,
// ensures that filters that match zero tests do not fail the overall command,
// and is intentionally *non-watch* (we force CI=true for the children).

const { spawn } = require('node:child_process')

const args = process.argv.slice(2)

const spawnNode = (script, extraEnv = {}) =>
  spawn(process.execPath, [script, ...args], {
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  })

const childEnv = { CI: 'true' }
const backendEnv = {
  ...childEnv,
  NODE_OPTIONS: '--experimental-vm-modules --no-warnings',
}
const children = [
  spawnNode(require.resolve('./test-backend.js'), backendEnv),
  spawnNode(require.resolve('./test-frontend.js'), childEnv),
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

// Propagate termination signals so Ctrl-C stops both Jest processes.
;['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    children.forEach((c) => c.kill(sig))
  })
})
