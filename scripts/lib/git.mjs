/** What the scripts that ask the local clone about its history and checkouts share. */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/** Whether `revision` is `ancestor` or a commit after it, by the local clone's history. */
export function isGitDescendant(ancestor, revision) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, revision], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * The main checkout: the first entry of `git worktree list` for the checkout at `root`, which is
 * the repository's own working tree, not a linked worktree. `env` is git's environment; a test
 * passes one built for a throwaway repository.
 */
function mainCheckout(root, env = process.env) {
  const list = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', env })
  return list.split('\n')[0].replace(/^worktree /, '')
}

/**
 * The .env of the checkout at `root`, or of the main checkout when `root` is a worktree without
 * one. The file may not exist.
 */
export function dotenvFile(root, env = process.env) {
  const own = path.join(root, '.env')
  if (existsSync(own)) return own
  return path.join(mainCheckout(root, env), '.env')
}

/**
 * Brings the main checkout up to date with its upstream after a PR has landed, so that the
 * sessions reading files there see what `main` has. Only when it is on `main` with no changes and
 * no untracked files: another branch or a dirty tree belongs to the user or another session, and
 * stays as it is. `git pull --ff-only` never makes a merge commit; it fails, and the checkout
 * stays, when local `main` has commits `origin/main` does not. Returns one line saying what
 * happened.
 */
export function pullMainCheckout(root, env = process.env) {
  const main = mainCheckout(root, env)
  const git = (...args) => spawnSync('git', ['-C', main, ...args], { encoding: 'utf8', env })
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').stdout.trim()
  if (branch !== 'main') return `main checkout ${main} is on ${branch}, not pulled`
  const status = git('status', '--porcelain')
  if (status.status !== 0) return `main checkout ${main}: git status failed: ${status.stderr.trim()}`
  if (status.stdout.trim()) return `main checkout ${main} has changes, not pulled`
  const before = git('rev-parse', 'HEAD').stdout.trim()
  const pull = git('pull', '--ff-only', '--quiet')
  if (pull.status !== 0) return `main checkout ${main}: git pull --ff-only failed: ${pull.stderr.trim()}`
  const after = git('rev-parse', 'HEAD').stdout.trim()
  if (after === before) return `main checkout ${main} is up to date`
  return `main checkout ${main} pulled ${before.slice(0, 9)}..${after.slice(0, 9)}`
}
