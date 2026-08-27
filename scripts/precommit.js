// Runs every pre-commit check concurrently instead of one after another, since they're
// independent of each other. `successCondition: 'all'` (concurrently's default) means the hook
// still fails if any one of them does, but a developer sees every failure from this run at once
// instead of stopping at the first and re-discovering the rest on the next commit attempt.
const { concurrently } = require('concurrently')

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const { result } = concurrently(
  [
    { command: `${npmCommand} run lint`, name: 'lint' },
    { command: `${npmCommand} run check-chart-screenshots`, name: 'screenshots' },
    { command: `${npmCommand} run knip`, name: 'knip' },
    { command: `${npmCommand} test -- --onlyChanged`, name: 'test' },
  ],
  { prefix: 'name', timings: true }
)

result.then(
  () => process.exit(0),
  () => process.exit(1)
)
