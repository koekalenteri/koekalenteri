/** What the scripts that ask the local clone about its history and checkouts share. */
import { execFileSync } from 'node:child_process'
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
 * The .env of the checkout at `root`, or of the main checkout (the first entry of
 * `git worktree list`) when `root` is a worktree without one. The file may not exist. `env` is
 * git's environment; a test passes one built for a throwaway repository.
 */
export function dotenvFile(root, env = process.env) {
  const own = path.join(root, '.env')
  if (existsSync(own)) return own
  const list = execFileSync('git', ['-C', root, 'worktree', 'list', '--porcelain'], { encoding: 'utf8', env })
  return path.join(list.split('\n')[0].replace(/^worktree /, ''), '.env')
}
