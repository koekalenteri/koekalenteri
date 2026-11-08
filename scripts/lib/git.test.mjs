import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
  it("takes the checkout's own .env when it has one", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dotenv-file-'))
    try {
      writeFileSync(path.join(dir, '.env'), '')

      expect(dotenvFile(dir)).toBe(path.join(dir, '.env'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('otherwise points into a checkout of this repository', () => {
    const file = dotenvFile(path.join(import.meta.dirname, '..', '..'))

    expect(path.basename(file)).toBe('.env')
    expect(existsSync(path.join(path.dirname(file), '.git'))).toBe(true)
  })
})
