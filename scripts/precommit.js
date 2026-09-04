// Runs every pre-commit check concurrently instead of one after another, since they're
// independent of each other. `successCondition: 'all'` (concurrently's default) means the hook
// still fails if any one of them does, but a developer sees every failure from this run at once
// instead of stopping at the first and re-discovering the rest on the next commit attempt.
const { execFileSync } = require('node:child_process')
const { concurrently } = require('concurrently')

// The index is what gets committed, but the checks below read the working tree, and with more than
// one session sharing this checkout the index can change while they run: 7015585a shipped a file
// in the state another session had staged mid-check, and main stopped typechecking. Snapshot the
// staged tree before the checks and refuse the commit if it is no longer the tree that was checked.
const stagedTree = () => execFileSync('git', ['write-tree'], { encoding: 'utf8' }).trim()

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

const checkedTree = stagedTree()

const { result } = concurrently(
  [
    { command: `${npmCommand} run lint`, name: 'lint' },
    { command: `${npmCommand} run check-screenshots`, name: 'screenshots' },
    { command: `${npmCommand} run knip`, name: 'knip' },
    { command: `${npmCommand} test -- --onlyChanged`, name: 'test' },
  ],
  { prefix: 'name', timings: true }
)

result.then(
  () => {
    if (stagedTree() !== checkedTree) {
      console.error('precommit: the index changed while the checks ran; stage the commit again and retry')
      process.exit(1)
    }
    process.exit(0)
  },
  () => process.exit(1)
)
