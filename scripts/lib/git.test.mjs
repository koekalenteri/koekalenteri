import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dotenvFile, isGitDescendant } from './git.mjs'
import { createThrowawayRepo } from './throwaway-repo.mjs'

describe('isGitDescendant', () => {
  it('counts a commit as following itself', () => {
    expect(isGitDescendant('HEAD', 'HEAD')).toBe(true)
  })

  it('does not count a commit the clone does not have', () => {
    expect(isGitDescendant('HEAD', 'deadbeef'.repeat(5))).toBe(false)
  })
})

describe('dotenvFile', () => {
  // A repository of its own with a linked worktree.
  let repo
  let main
  let worktree
  let env

  beforeAll(() => {
    repo = createThrowawayRepo('dotenv-file-', 'main')
    main = repo.dir
    env = repo.env
    worktree = path.join(repo.base, 'worktree')
    repo.git('commit', '-q', '--allow-empty', '-m', 'first')
    repo.git('worktree', 'add', '-q', '-b', 'side', worktree)
    writeFileSync(path.join(main, '.env'), '')
  })

  afterAll(() => {
    repo.remove()
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
