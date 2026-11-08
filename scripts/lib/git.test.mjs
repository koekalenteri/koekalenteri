import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dotenvFile, isGitDescendant } from './git.mjs'

describe('isGitDescendant', () => {
  it('counts a commit as following itself', () => {
    expect(isGitDescendant('HEAD', 'HEAD')).toBe(true)
  })

  it('does not count a commit the clone does not have', () => {
    expect(isGitDescendant('HEAD', 'deadbeef'.repeat(5))).toBe(false)
  })
})

describe('dotenvFile', () => {
  // A repository of its own with a linked worktree, which must never reach the caller's
  // repository. The pre-commit hook runs this file with GIT_DIR and GIT_INDEX_FILE set, and a
  // `git init` that inherits them rewrites the repository being committed to. So git here gets a
  // built environment, as in smoke-deploy.test.mjs: no GIT_* variable, an empty global config, no
  // system config, and a ceiling that stops discovery above the throwaway directory.
  let base
  let main
  let worktree
  let env

  beforeAll(() => {
    base = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'dotenv-file-')))
    main = path.join(base, 'main')
    worktree = path.join(base, 'worktree')
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
    const git = (...args) => execFileSync('git', [...config, ...args], { cwd: main, encoding: 'utf8', env }).trim()
    execFileSync('git', ['init', '-q', main], { cwd: base, env })
    // Every later command runs in `main`; refuse to go on if git resolves anything else there.
    expect(git('rev-parse', '--absolute-git-dir')).toBe(path.join(main, '.git'))
    git('commit', '-q', '--allow-empty', '-m', 'first')
    git('worktree', 'add', '-q', '-b', 'side', worktree)
    writeFileSync(path.join(main, '.env'), '')
  })

  afterAll(() => {
    rmSync(base, { recursive: true, force: true })
  })

  it("takes the checkout's own .env when it has one", () => {
    expect(dotenvFile(main, env)).toBe(path.join(main, '.env'))
  })

  it("takes the main checkout's .env from a worktree without one", () => {
    expect(dotenvFile(worktree, env)).toBe(path.join(main, '.env'))
  })

  it("takes the worktree's own .env once it has one", () => {
    writeFileSync(path.join(worktree, '.env'), '')
    try {
      expect(dotenvFile(worktree, env)).toBe(path.join(worktree, '.env'))
    } finally {
      rmSync(path.join(worktree, '.env'))
    }
  })
})
