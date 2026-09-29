/**
 * The browser tests on a developer's machine in one command (KOE-1485):
 *
 *   npm run test-e2e-local                         build, then run every test
 *   npm run test-e2e-local -- e2e/tests/groups.spec.ts --headed
 *   npm run test-e2e-local -- --no-build --ui      skip the builds, open Playwright's UI
 *
 * Everything but --no-build goes to `playwright test` as is. Before the tests it
 *   - refuses to start while something listens on the test ports: outside CI Playwright reuses a
 *     running server, and `npm start` on 3000/8080 would put the tests against the dev stack;
 *   - starts an in-memory DynamoDB-local of its own on DYNAMODB_PORT and leaves it running for the
 *     next run, away from the dev container on 8000 (the tests never empty a table);
 *   - builds the lambda bundles and the e2e frontend, since the tests run the builds.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import net from 'node:net'
import { API_PORT, FAKES_PORT, FRONTEND_PORT } from './env.mjs'

const CONTAINER = 'koekalenteri-e2e-dynamodb'
const DYNAMODB_PORT = 8001
const DYNAMODB_ENDPOINT = `http://127.0.0.1:${DYNAMODB_PORT}`

const args = process.argv.slice(2)
const build = !args.includes('--no-build')
const playwrightArgs = args.filter((arg) => arg !== '--no-build')

const fail = (message) => {
  console.error(`\n${message}\n`)
  process.exit(1)
}

const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

const run = (command, commandArgs, env = {}) =>
  spawnSync(command, commandArgs, { env: { ...process.env, ...env }, stdio: 'inherit' }).status ?? 1

const busy = []
for (const port of [FRONTEND_PORT, API_PORT, FAKES_PORT]) {
  if (await listening(port)) busy.push(port)
}
if (busy.length) {
  fail(
    `Something is listening on ${busy.join(', ')}. The tests would use it instead of their own server; ` +
      'stop it first (npm start runs on 3000 and 8080).'
  )
}

const containerRunning = () => {
  try {
    return execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', CONTAINER], { stdio: 'pipe' })
      .toString()
      .trim()
  } catch {
    return 'missing'
  }
}

try {
  execFileSync('docker', ['info'], { stdio: 'ignore' })
} catch {
  fail('Docker is needed for DynamoDB-local; start Docker Desktop first.')
}
const state = containerRunning()
if (state !== 'true') {
  if (state === 'false') execFileSync('docker', ['rm', CONTAINER], { stdio: 'ignore' })
  console.log(`Starting ${CONTAINER} on ${DYNAMODB_PORT}`)
  const status = run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    CONTAINER,
    '-p',
    `${DYNAMODB_PORT}:8000`,
    'amazon/dynamodb-local',
  ])
  if (status !== 0) fail('Could not start DynamoDB-local.')
}
for (let attempt = 0; !(await listening(DYNAMODB_PORT)); attempt++) {
  if (attempt > 50) fail(`DynamoDB-local did not answer on ${DYNAMODB_PORT}.`)
  await new Promise((resolve) => setTimeout(resolve, 200))
}

if (build) {
  if (run('npm', ['run', 'build-backend']) !== 0) fail('The backend build failed.')
  if (run('npm', ['run', 'build-e2e-frontend']) !== 0) fail('The e2e frontend build failed.')
}

process.exit(run('npx', ['playwright', 'test', ...playwrightArgs], { DYNAMODB_ENDPOINT }))
