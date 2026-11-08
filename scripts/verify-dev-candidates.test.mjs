import { areasOf, candidateRow, commitsClaiming, devDeploy } from '../.claude/skills/verify-dev/candidates.mjs'

// /verify-dev (KOE-1733) tests an issue only once its change is on dev. "On dev" is decided from
// the CI runs on main: the newest one whose deploy-dev smoke check passed, and whether the issue's
// commit is in that run's history.

const jobs = (entries) => entries.map(([name, conclusion]) => ({ name, conclusion }))

describe('devDeploy', () => {
  it('takes the newest run whose deploy-dev smoke check passed', async () => {
    const runs = [
      { id: 3, head_sha: 'c3' },
      { id: 2, head_sha: 'c2' },
      { id: 1, head_sha: 'c1' },
    ]
    const byRun = {
      1: jobs([['deploy-dev / smoke', 'success']]),
      // A push that changed neither backend nor frontend has no deploy at all.
      2: jobs([['deploy-dev', 'skipped']]),
      3: jobs([['deploy-dev / smoke', 'failure']]),
    }

    expect(await devDeploy(runs, async (id) => byRun[id])).toEqual({ runId: 1, sha: 'c1', e2e: undefined })
  })

  it('reports the e2e job of that deploy, which runs after the code is out', async () => {
    const runs = [{ id: 7, head_sha: 'c7' }]
    const byRun = {
      7: jobs([
        ['deploy-dev / smoke', 'success'],
        ['deploy-dev / e2e', 'failure'],
      ]),
    }

    expect(await devDeploy(runs, async (id) => byRun[id])).toEqual({ runId: 7, sha: 'c7', e2e: 'failure' })
  })

  it('finds nothing when no run in the window deployed', async () => {
    expect(await devDeploy([{ id: 1, head_sha: 'c1' }], async () => jobs([['deploy-dev', 'skipped']]))).toBe(
      undefined
    )
  })
})

describe('commitsClaiming', () => {
  const log = [
    { sha: 'a3', message: 'fix(app): other thing (KOE-2) (#12)' },
    { sha: 'a2', message: 'docs: the gate explained (#11)\n\nThe KOE-1 gate stays as it is.' },
    { sha: 'a1', message: 'feat(events): a thing (KOE-1, KOE-9) (#10)\n\nbody\n\nKOE-3' },
  ]

  it('keeps the commits that claim the key, newest first', () => {
    expect(commitsClaiming(log, 'KOE-1').map((c) => c.sha)).toEqual(['a1'])
    expect(commitsClaiming(log, 'KOE-3').map((c) => c.sha)).toEqual(['a1'])
  })

  it('does not take a key cited mid-sentence as a claim', () => {
    expect(commitsClaiming(log, 'KOE-1').map((c) => c.sha)).not.toContain('a2')
  })
})

describe('areasOf', () => {
  it('names src folders two deep and the rest by their top folder', () => {
    expect(
      areasOf(['src/pages/admin/UsersPage.tsx', 'src/lambda/handlers/x.ts', '.claude/skills/a.md', 'README.md'])
    ).toEqual(['.claude', 'README.md', 'src/lambda', 'src/pages'])
  })
})

describe('candidateRow', () => {
  const issue = { key: 'KOE-1', status: 'Ready for Testing', summary: 'Thing' }
  const commits = [
    { sha: 'bbbbbbbbbb', message: 'fix(app): again (KOE-1) (#21)', files: ['src/pages/A.tsx'] },
    { sha: 'aaaaaaaaaa', message: 'feat(app): thing (KOE-1) (#20)', files: ['src/lambda/b.ts'] },
  ]

  it('is on dev when the newest claiming commit is in the deployed history', () => {
    const isDescendant = (ancestor, revision) => ancestor === 'bbbbbbbbbb' && revision === 'dev'

    expect(candidateRow(issue, commits, 'dev', isDescendant)).toEqual({
      ...issue,
      onDev: 'yes',
      commit: 'bbbbbbbb',
      prs: ['#21', '#20'],
      areas: ['src/lambda', 'src/pages'],
    })
  })

  it('is not on dev while the newest commit is past the deploy, even if an older one is in it', () => {
    const isDescendant = (ancestor) => ancestor === 'aaaaaaaaaa'

    expect(candidateRow(issue, commits, 'dev', isDescendant).onDev).toBe('no')
  })

  it('says so when no commit on main claims the issue', () => {
    expect(candidateRow(issue, [], 'dev', () => true)).toEqual({
      ...issue,
      onDev: 'no commit',
      commit: '-',
      prs: [],
      areas: [],
    })
  })

  it('is not on dev when no deploy was found', () => {
    expect(candidateRow(issue, commits, undefined, () => true).onDev).toBe('no deploy')
  })
})
