import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dotenvFile, isGitDescendant, pullMainCheckout } from './git.mjs'
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

describe('pullMainCheckout', () => {
  // The throwaway repository stands for origin: a commit made in it is a PR landing on main. The
  // main checkout is a clone of it with a linked worktree; `inMain` runs git there through the
  // throwaway repository's own git, with its environment and config.
  let origin
  let main
  let worktree
  let env
  let inMain
  let land

  beforeAll(() => {
    origin = createThrowawayRepo('pull-main-checkout-', 'origin')
    env = origin.env
    main = path.join(origin.base, 'main')
    worktree = path.join(origin.base, 'worktree')
    origin.git('commit', '-q', '--allow-empty', '-m', 'first')
    origin.git('clone', '-q', origin.dir, main)
    inMain = (...args) => origin.git('-C', main, ...args)
    // Every later command in `main` runs there; refuse to go on if git resolves anything else.
    expect(inMain('rev-parse', '--absolute-git-dir')).toBe(path.join(main, '.git'))
    inMain('worktree', 'add', '-q', '-b', 'side', worktree)
    land = (message) => {
      origin.git('commit', '-q', '--allow-empty', '-m', message)
      return origin.git('rev-parse', 'HEAD')
    }
  })

  afterAll(() => {
    origin.remove()
  })

  it('fast-forwards the main checkout on main with a clean tree, also when asked from a worktree', () => {
    const landed = land('landed')
    expect(pullMainCheckout(worktree, env)).toMatch(/ pulled [0-9a-f]{9}\.\.[0-9a-f]{9}$/)
    expect(inMain('rev-parse', 'HEAD')).toBe(landed)
    expect(pullMainCheckout(main, env)).toBe(`main checkout ${main} is up to date`)
  })

  it('leaves a main checkout with changes as it is', () => {
    const before = inMain('rev-parse', 'HEAD')
    land('while dirty')
    writeFileSync(path.join(main, 'notes.txt'), '')
    try {
      expect(pullMainCheckout(main, env)).toBe(`main checkout ${main} has changes, not pulled`)
      expect(inMain('rev-parse', 'HEAD')).toBe(before)
    } finally {
      rmSync(path.join(main, 'notes.txt'))
    }
  })

  it('leaves a main checkout on another branch as it is', () => {
    inMain('checkout', '-q', '-b', 'user-work')
    try {
      const before = inMain('rev-parse', 'HEAD')
      land('while on a branch')
      expect(pullMainCheckout(main, env)).toBe(`main checkout ${main} is on user-work, not pulled`)
      expect(inMain('rev-parse', 'HEAD')).toBe(before)
    } finally {
      inMain('checkout', '-q', 'main')
    }
  })

  it('leaves local main with its own commits as it is and says the pull failed', () => {
    inMain('commit', '-q', '--allow-empty', '-m', 'local only')
    const before = inMain('rev-parse', 'HEAD')
    land('diverged')
    expect(pullMainCheckout(main, env)).toMatch(/: git pull --ff-only failed: /)
    expect(inMain('rev-parse', 'HEAD')).toBe(before)
  })
})
