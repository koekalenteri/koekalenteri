import {
  ciSummary,
  errorKind,
  errorSignature,
  flakyJobs,
  isFix,
  isRevert,
  looksClean,
  neighbourTags,
  planLink,
  prNumbers,
  projectDirName,
  prStats,
  reopenings,
  reviewerRun,
  reviewerTally,
  TranscriptStats,
  weeks,
  weightedTokens,
} from '../.claude/skills/improve/retro.mjs'

// /improve reads one production release through .claude/skills/improve/retro.mjs. These are the
// rules it counts by; the sources (git, GitHub, Jira, SonarCloud, transcripts) are read in main().

describe('neighbourTags', () => {
  it('skips pre-release tags and orders by version, not by text', () => {
    const tags = ['v2.0.1', 'v2.1.0-beta.1', 'v2.1.0', 'v1.10.6', 'v1.9.0', 'del', 'v2.10.0']
    expect(neighbourTags(tags, 'v2.1.0')).toEqual({ from: 'v2.0.1', next: 'v2.10.0' })
    expect(neighbourTags(tags, 'v1.10.6')).toEqual({ from: 'v1.9.0', next: 'v2.0.1' })
  })

  it('refuses a tag that is not a production tag', () => {
    expect(() => neighbourTags(['v2.1.0-beta.1'], 'v2.1.0-beta.1')).toThrow('not a production tag')
  })
})

describe('commit subjects', () => {
  it('takes the PR number of a squash merge only from the end of the subject', () => {
    expect(prNumbers(['fix(x): y (#1848)', 'chore: refs #12 in text', 'feat: z (#7) (#1850)'])).toEqual([1848, 1850])
  })

  it('tells reverts and fixes apart from the rest', () => {
    expect(['Revert "feat: x (#1)"', 'revert(ci): y', 'feat: revert button'].map(isRevert)).toEqual([true, true, false])
    expect(['fix(email): x', 'fix: y', 'fix!: z', 'feat: fix it', 'fixture: no'].map(isFix)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ])
  })
})

describe('prStats', () => {
  const node = (over = {}) => ({
    number: 1610,
    title: 'feat(x): y (KOE-1409)',
    createdAt: '2026-10-19T04:00:00Z',
    mergedAt: '2026-10-19T07:00:00Z',
    headRefName: 'koe-1409-registration-repository',
    author: { login: 'kurkle' },
    commits: {
      totalCount: 3,
      nodes: [{ commit: { parents: { totalCount: 1 } } }, { commit: { parents: { totalCount: 2 } } }],
    },
    timelineItems: {
      nodes: [
        { __typename: 'ReadyForReviewEvent', createdAt: '2026-10-19T05:00:00Z' },
        { __typename: 'ConvertToDraftEvent', createdAt: '2026-10-19T05:30:00Z' },
        { __typename: 'HeadRefForcePushedEvent', createdAt: '2026-10-19T05:40:00Z' },
        { __typename: 'ReadyForReviewEvent', createdAt: '2026-10-19T06:00:00Z' },
      ],
    },
    ...over,
  })

  it('measures from the last time the PR was marked ready, and counts how its branch was rewritten', () => {
    expect(prStats(node())).toEqual({
      number: 1610,
      title: 'feat(x): y (KOE-1409)',
      branch: 'koe-1409-registration-repository',
      bot: false,
      openToMergeH: 3,
      readyToMergeH: 1,
      commits: 3,
      mainMerges: 1,
      forcePushes: 1,
      backToDraft: 1,
    })
  })

  it('marks Dependabot PRs, which no agent works on', () => {
    expect(prStats(node({ author: { login: 'app/dependabot' }, headRefName: 'dependabot/npm_and_yarn/x' })).bot).toBe(
      true
    )
  })
})

describe('CI', () => {
  const job = (name, conclusion, run_attempt = 1, minutes = 5) => ({
    name,
    conclusion,
    run_attempt,
    started_at: '2026-10-19T05:00:00Z',
    completed_at: new Date(Date.parse('2026-10-19T05:00:00Z') + minutes * 60_000).toISOString(),
    steps: conclusion === 'failure' ? [{ name: 'Run tests', conclusion: 'failure' }] : [],
  })

  it('calls a job flaky when it failed in one attempt and passed in a later one', () => {
    expect(flakyJobs([job('e2e', 'failure', 1), job('e2e', 'success', 2), job('lint', 'success', 1)])).toEqual(['e2e'])
    // Failing again on the rerun is a real failure, not a flake.
    expect(flakyJobs([job('e2e', 'failure', 1), job('e2e', 'failure', 2)])).toEqual([])
  })

  it('times the jobs of the last attempt and names the failed step of every red one', () => {
    const runs = [
      {
        id: 1,
        event: 'pull_request',
        conclusion: 'success',
        run_attempt: 2,
        run_started_at: '2026-10-19T05:00:00Z',
        updated_at: '2026-10-19T05:20:00Z',
      },
      {
        id: 2,
        event: 'merge_group',
        conclusion: 'success',
        run_attempt: 1,
        run_started_at: '2026-10-19T06:00:00Z',
        updated_at: '2026-10-19T06:10:00Z',
      },
    ]
    const jobs = new Map([
      [1, [job('e2e', 'failure', 1, 30), job('e2e', 'success', 2, 10)]],
      [2, [job('e2e', 'success', 1, 12), job('deploy', 'skipped', 1, 0)]],
    ])

    const summary = ciSummary(runs, jobs)

    expect(summary.jobs).toEqual([{ name: 'e2e', runs: 2, median: 12, p90: 12 }])
    expect(summary.redReasons).toEqual([{ key: 'e2e :: Run tests', count: 1 }])
    expect(summary.flaky).toEqual([{ key: 'e2e', count: 1 }])
    expect(summary).toMatchObject({ runs: 2, reruns: 1, byEvent: { pull_request: 1, merge_group: 1 } })
  })

  it('asks for the runs a week at a time, since GitHub lists at most 1000 for one filter', () => {
    expect(weeks('2026-10-01T00:00:00Z', '2026-10-10T00:00:00Z')).toEqual([
      '2026-10-01T00:00:00.000Z..2026-10-07T23:59:59.000Z',
      '2026-10-08T00:00:00.000Z..2026-10-09T23:59:59.000Z',
    ])
  })
})

describe('Jira', () => {
  it('counts a move from testing or Done back to In Progress, nothing else', () => {
    const histories = [
      { created: '2026-11-01', items: [{ field: 'status', fromString: 'Ready for Testing', toString: 'In Progress' }] },
      { created: '2026-11-02', items: [{ field: 'status', fromString: 'Backlog', toString: 'In Progress' }] },
      { created: '2026-11-03', items: [{ field: 'assignee', fromString: 'Done', toString: 'In Progress' }] },
      { created: '2026-11-04', items: [{ field: 'status', fromString: 'Done', toString: 'In Progress' }] },
    ]
    expect(reopenings(histories)).toEqual([
      { at: '2026-11-01', from: 'Ready for Testing' },
      { at: '2026-11-04', from: 'Done' },
    ])
  })

  it('finds the plan document on the description last line only', () => {
    expect(planLink('Joukkuekilpailut\nSuunnitelma: https://claude.ai/artifact/abc')).toBe(
      'https://claude.ai/artifact/abc'
    )
    expect(planLink('Suunnitelma: https://x\nmore text')).toBeUndefined()
    expect(planLink(null)).toBeUndefined()
  })
})

describe('reviewer reports', () => {
  it('reads the tally line and nothing else as a count', () => {
    expect(reviewerTally('Angle: tests\n...\nFindings: 2 confirmed, 1 plausible, 0 notes')).toEqual({
      confirmed: 2,
      plausible: 1,
      notes: 0,
    })
    expect(reviewerTally('Result: no confirmed findings.')).toBeUndefined()
    expect(looksClean('Docs angle, round 3: no findings and no notes.')).toBe(true)
    expect(looksClean('1. **confirmed** the guard is missing')).toBe(false)
  })

  it('takes the angle and round from the Agent description', () => {
    expect(reviewerRun('PR 1752 review: rule-readers')).toEqual({ angle: 'rule-readers', round: 1, plan: false })
    expect(reviewerRun('KOE-1140 review root-cause r3')).toEqual({ angle: 'root-cause', round: 3, plan: false })
    expect(reviewerRun('KOE-1697 plan: architecture')).toEqual({ angle: 'architecture', round: 1, plan: true })
  })
})

describe('tool errors', () => {
  it.each([
    ['Permission for this action was denied by the Claude Code auto mode classifier.', 'Bash', 'permission'],
    ['PreToolUse:Bash hook error: Refused: git merge.', 'Bash', 'hook'],
    ['This agent is isolated in the worktree /x', 'Bash', 'sandbox'],
    ['### Error TimeoutError: locator.click', 'mcp__playwright__browser_click', 'mcp'],
    ['<tool_use_error>File has not been read yet.</tool_use_error>', 'Write', 'harness'],
    ['Exit code 1 FAIL src/x.test.ts', 'Bash', 'exit'],
    ['The server-side auto mode classifier gave no verdict (error)', 'Bash', 'permission'],
  ])('%s is %s', (text, tool, kind) => {
    expect(errorKind(text, tool)).toBe(kind)
  })

  it('counts one cause once, whatever worktree or number it names', () => {
    const a = 'This agent is isolated in the worktree /x/.claude/worktrees/agent-a1, but this command names git'
    const b = 'This agent is isolated in the worktree /x/.claude/worktrees/agent-b22, but this command names git'
    expect(errorSignature(a)).toBe(errorSignature(b))
    expect(errorSignature(a)).toBe('This agent is isolated in the worktree <path> but this command names git')
  })
})

describe('tokens', () => {
  it('weighs every count by its price relative to a fresh input token', () => {
    const usage = {
      input_tokens: 10,
      cache_creation_input_tokens: 300,
      cache_creation: { ephemeral_1h_input_tokens: 100 },
      cache_read_input_tokens: 1000,
      output_tokens: 20,
    }
    // 10 + 200 * 1.25 + 100 * 2 + 1000 * 0.1 + 20 * 5
    expect(weightedTokens(usage)).toBe(660)
  })

  it('names the transcript folder the way Claude Code does', () => {
    expect(projectDirName('/Volumes/Code/koekalenteri/.claude/worktrees/x')).toBe(
      '-Volumes-Code-koekalenteri--claude-worktrees-x'
    )
  })
})

describe('TranscriptStats', () => {
  const window = { from: '2026-10-06T00:00:00Z', to: '2026-11-03T00:00:00Z' }
  const prs = [{ number: 1610, branch: 'koe-1409-registration-repository', keys: ['KOE-1409'] }]
  const usage = { input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1 }
  const assistant = (ts, id, content = [], extra = {}) => ({
    type: 'assistant',
    timestamp: ts,
    gitBranch: 'main',
    message: { id, model: 'claude-sonnet-5-5', usage, content },
    ...extra,
  })
  const result = (ts, id, text, isError = false) => ({
    type: 'user',
    timestamp: ts,
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: text, is_error: isError }] },
  })

  it('counts a message once although its blocks come on several lines, and only inside the window', () => {
    const stats = new TranscriptStats({ ...window, prs, skills: ['ticket'] })
    stats.begin({ sessionId: 's1', agentType: 'main' })
    // A built-in command is no skill; the session stays /ticket.
    stats.line({
      type: 'user',
      timestamp: '2026-10-10T09:00:00Z',
      message: { content: '<command-name>/model</command-name>\n<command-args></command-args>' },
    })
    stats.line({
      type: 'user',
      timestamp: '2026-10-10T10:00:00Z',
      message: { content: '<command-name>/ticket</command-name>\n<command-args>KOE-1409</command-args>' },
    })
    stats.line(assistant('2026-10-10T10:00:01Z', 'm1', [{ type: 'text', text: 'a' }]))
    stats.line(
      assistant('2026-10-10T10:00:01Z', 'm1', [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }])
    )
    stats.line(assistant('2026-12-01T10:00:00Z', 'm2'))
    stats.end()

    const { tokens } = stats.result()
    expect(tokens.byAgent).toEqual([
      { agent: 'main', input: 1, cacheWrite: 0, cacheRead: 0, output: 1, weighted: 6, turns: 1 },
    ])
    expect(tokens.bySkill.map((r) => r.skill)).toEqual(['/ticket'])
    // The /ticket argument names the issue, and the issue's PR gets the session's tokens.
    expect(tokens.byPr.map((r) => r.pr)).toEqual(['#1610'])
  })

  it('measures the wait for an answer, and keeps it out of the pauses', () => {
    const stats = new TranscriptStats({ ...window, prs })
    stats.begin({ sessionId: 's1', agentType: 'main' })
    stats.line(
      assistant('2026-10-10T10:00:00Z', 'm1', [{ type: 'tool_use', id: 'q', name: 'AskUserQuestion', input: {} }])
    )
    stats.line(result('2026-10-10T12:00:00Z', 'q', 'answered'))
    stats.line(assistant('2026-10-10T12:00:05Z', 'm2'))
    // Bookkeeping after the turn's end is no activity.
    stats.line({ type: 'system', timestamp: '2026-10-10T12:00:06Z' })
    stats.line(assistant('2026-10-10T13:00:05Z', 'm3'))
    stats.end()

    const r = stats.result()
    expect(r.questionWaits).toEqual([{ session: 's1', at: '2026-10-10T10:00:00Z', minutes: 120 }])
    // The session had ended its turn: the hour is the user's, not a tool's.
    expect(r.pauses).toEqual([{ session: 's1', at: '2026-10-10T12:00:05.000Z', minutes: 60, after: 'user' }])
  })

  it('finds the costly results, repeated reads, polling, errors and conflicts of a subagent', () => {
    const stats = new TranscriptStats({ ...window, prs })
    stats.begin({ sessionId: 's1', agentType: 'implementer', description: 'Implement KOE-1409' })
    const at = (n) => `2026-10-10T10:${String(n).padStart(2, '0')}:00Z`
    stats.line(
      assistant(at(0), 'm0', [{ type: 'tool_use', id: 'big', name: 'Bash', input: { command: 'gh run view 1 --log' } }])
    )
    stats.line(result(at(1), 'big', 'x'.repeat(40_000)))
    for (const n of [2, 3, 4]) {
      stats.line(
        assistant(at(n), `r${n}`, [
          { type: 'tool_use', id: `read${n}`, name: 'Read', input: { file_path: '/a.ts' } },
          {
            type: 'tool_use',
            id: `poll${n}`,
            name: 'Bash',
            input: { command: 'sleep 30; gh pr view 1610 --json mergeable' },
          },
        ])
      )
      stats.line(result(at(n), `poll${n}`, '{"mergeable":"CONFLICTING"}'))
    }
    stats.line(assistant(at(5), 'm5', [{ type: 'tool_use', id: 'e', name: 'Bash', input: { command: 'git commit' } }]))
    stats.line(result(at(5), 'e', 'Exit code 1 husky - pre-commit script failed (code 1)', true))
    stats.end()

    const r = stats.result()
    // 10 000 tokens read again on each of the four later turns.
    expect(r.bigResults).toEqual([
      {
        tool: 'Bash',
        input: 'gh run view 1 --log',
        chars: 40_000,
        turn: 1,
        agent: 'implementer',
        session: 's1',
        carriedTokens: 40_000,
      },
    ])
    expect(r.repeatedReads).toEqual([{ file: '/a.ts:', count: 3, agent: 'implementer' }])
    expect(r.repeatedCommands).toEqual([
      { command: 'sleep 30; gh pr view 1610 --json mergeable', count: 3, agent: 'implementer' },
    ])
    expect(r.sleeps).toEqual({ calls: 3, seconds: 90 })
    expect(r.conflictSightings).toEqual({ '#1610': 3 })
    expect(r.gitHooks).toEqual({ preCommitFailed: 1, commitMsgFailed: 0 })
    expect(r.toolErrors).toEqual([{ kind: 'exit', tool: 'Bash', count: 1 }])
    expect(r.tokens.byPr.map((p) => p.pr)).toEqual(['#1610'])
  })

  it('counts a reviewer by angle and round from its handback', () => {
    const stats = new TranscriptStats({ ...window, prs })
    stats.begin({ sessionId: 's1', agentType: 'reviewer', description: 'Review PR 1610: tests r2' })
    stats.line(
      assistant('2026-10-10T10:00:00Z', 'm1', [
        {
          type: 'tool_use',
          id: 'h',
          name: 'SubagentHandback',
          input: { message: 'Angle: tests\nFindings: 1 confirmed, 0 plausible, 2 notes' },
        },
      ])
    )
    stats.end()

    const r = stats.result()
    expect(r.reviewers).toEqual([
      { angle: 'tests', round: 'r2', runs: 1, tallied: 1, confirmed: 1, plausible: 0, notes: 2, cleanUntallied: 0 },
    ])
    expect(r.reviewerRunsPerPr).toEqual({ '#1610': 1 })
  })
})
