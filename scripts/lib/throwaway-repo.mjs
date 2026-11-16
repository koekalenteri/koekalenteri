import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * A git repository of its own in a temporary directory, for tests that need real history.
 *
 * It must never reach the caller's repository. The pre-commit hook runs the tests with GIT_DIR
 * and GIT_INDEX_FILE set, and a `git init` that inherits them rewrites the repository being
 * committed to (core.bare = true in its shared config). So git here gets a built environment, not
 * the caller's: no GIT_* variable, an empty global config, no system config, and a ceiling that
 * stops discovery above the temporary directory. A child process the test starts in the
 * repository gets the same `env`.
 *
 * @param {string} prefix the temporary directory's name prefix
 * @param {string} [name] the repository's folder inside the temporary directory
 */
export const createThrowawayRepo = (prefix, name = 'repo') => {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)))
  const dir = path.join(base, name)
  const globalConfig = path.join(base, 'gitconfig')
  writeFileSync(globalConfig, '')
  const env = {
    GIT_CEILING_DIRECTORIES: base,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: '1',
    HOME: base,
    PATH: process.env.PATH,
  }
  const config = ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false']
  /** Runs git in the repository and returns its trimmed output. */
  const git = (...args) => execFileSync('git', [...config, ...args], { cwd: dir, encoding: 'utf8', env }).trim()
  const remove = () => rmSync(base, { force: true, recursive: true })

  execFileSync('git', ['init', '-q', '-b', 'main', dir], { cwd: base, env })
  // Every later command runs in `dir`; refuse to go on if git resolves anything else there.
  const gitDir = git('rev-parse', '--absolute-git-dir')
  if (gitDir !== path.join(dir, '.git')) {
    remove()
    throw new Error(`throwaway repository resolves to ${gitDir}, not ${path.join(dir, '.git')}`)
  }

  return { base, dir, env, git, remove }
}
