/** What the scripts that ask the local clone about its history share. */
import { execFileSync } from 'node:child_process'

/** Whether `revision` is `ancestor` or a commit after it, by the local clone's history. */
export function isGitDescendant(ancestor, revision) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, revision], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}
