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

const supportsColor = (stream) => {
  if (!stream || !stream.isTTY) return false
  if (process.env.NO_COLOR) return false
  if (process.env.FORCE_COLOR === '0') return false
  return true
}

const ANSI = {
  reset: '\u001b[0m',
  fg: {
    cyan: '\u001b[36m',
    magenta: '\u001b[35m',
  },
}

const colorizeStream = (stream, color, target) => {
  if (!stream) return

  // Colorize per line so parallel Jest output stays readable without prefixes.
  let buffered = ''
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    buffered += chunk
    const lines = buffered.split('\n')
    buffered = lines.pop() ?? ''
    for (const line of lines) {
      if (!supportsColor(target)) {
        target.write(`${line}\n`)
      } else {
        target.write(`${color}${line}${ANSI.reset}\n`)
      }
    }
  })
  stream.on('end', () => {
    if (!buffered.length) return
    if (!supportsColor(target)) {
      target.write(buffered)
    } else {
      target.write(`${color}${buffered}${ANSI.reset}`)
    }
  })
}

const spawnNode = (script, extraEnv = {}, color = '') => {
  const child = spawn(process.execPath, [script, ...args], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...extraEnv },
  })
  colorizeStream(child.stdout, color, process.stdout)
  colorizeStream(child.stderr, color, process.stderr)
  return child
}

const childEnv = { CI: 'true' }
const backendEnv = {
  ...childEnv,
  NODE_OPTIONS: '--experimental-vm-modules --no-warnings',
  DOTENV_CONFIG_QUIET: 'true',
}
// Run in parallel, but prefix output to avoid confusing interleaving.
const children = [
  spawnNode(require.resolve('./test-backend.js'), backendEnv, ANSI.fg.cyan),
  spawnNode(require.resolve('./test-frontend.js'), childEnv, ANSI.fg.magenta),
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
