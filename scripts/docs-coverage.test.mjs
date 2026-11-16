import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./docs-coverage.mjs', import.meta.url))

describe('docs-coverage --since', () => {
  // A repository of its own, which must never reach the caller's repository: the pre-commit hook
  // runs this file with GIT_DIR and GIT_INDEX_FILE set, so git and the script get a built
  // environment as in lib/git.test.mjs.
  let base
  let repo
  let env

  beforeAll(() => {
    base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'docs-coverage-')))
    repo = path.join(base, 'repo')
    const globalConfig = path.join(base, 'gitconfig')
    writeFileSync(globalConfig, '')
    env = {
      GIT_CEILING_DIRECTORIES: base,
      GIT_CONFIG_GLOBAL: globalConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: base,
      PATH: process.env.PATH,
    }
    const config = ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false']
    const git = (...args) => execFileSync('git', [...config, ...args], { cwd: repo, encoding: 'utf8', env }).trim()
    execFileSync('git', ['init', '-q', '-b', 'main', repo], { cwd: base, env })
    expect(git('rev-parse', '--absolute-git-dir')).toBe(path.join(repo, '.git'))
    git('commit', '-q', '--allow-empty', '-m', 'first')
    git('checkout', '-q', '-b', 'side')
    writeFileSync(path.join(repo, 'notes.md'), 'side\n')
    git('add', 'notes.md')
    git('commit', '-q', '-m', 'side touches nothing under src')
    git('checkout', '-q', 'main')
    mkdirSync(path.join(repo, 'src'))
    writeFileSync(path.join(repo, 'src', 'app.ts'), 'export {}\n')
    git('add', 'src/app.ts')
    git('commit', '-q', '-m', 'main touches src after the branch point')
    git('checkout', '-q', 'side')
  })

  afterAll(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it('lists only what the branch changed, not what main changed after the branch point', () => {
    const output = execFileSync('node', [script, '--since', 'main'], { cwd: repo, encoding: 'utf8', env })
    expect(output.trim()).toBe('docs-coverage: no application code in this change')
  })
})
