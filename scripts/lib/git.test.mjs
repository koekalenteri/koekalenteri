import { isGitDescendant } from './git.mjs'

describe('isGitDescendant', () => {
  it('counts a commit as following itself', () => {
    expect(isGitDescendant('HEAD', 'HEAD')).toBe(true)
  })

  it('does not count a commit the clone does not have', () => {
    expect(isGitDescendant('HEAD', 'deadbeef'.repeat(5))).toBe(false)
  })
})
