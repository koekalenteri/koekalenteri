#!/usr/bin/env node
// The issues /verify-dev may test, and whether each one's change is on dev yet.
//
// "On dev" means the newest commit on main that claims the issue (claimedKeys, the rule the CI
// jira-testable job uses) is in the history of the newest main push run whose `deploy-dev / smoke`
// job succeeded. Smoke is the last step of the deploy itself; `deploy-dev / e2e` runs after it and
// can fail with the code already out, so its state is reported, not required. A cancelled or failed
// deploy leaves no gap: the next push then builds and deploys both backend and frontend.
//
// Output: a header line naming the deploy, then one tab-separated line per issue:
//   key  status  onDev  commit  prs  areas  summary
// onDev is yes, no, "no commit" (nothing on main claims the key) or "no deploy" (no run found).
// areas are the folders the claiming commits changed: a hint for "testable through the UI".
//
// Usage: .claude/skills/verify-dev/candidates.mjs [KEY...]   (default: every Ready for Testing issue)
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isGitDescendant } from '../../../scripts/lib/git.mjs'
import { claimedKeys, credentialsFromEnv, jiraClient } from '../../../scripts/lib/jira.mjs'

const SMOKE_JOB = 'deploy-dev / smoke'
const E2E_JOB = 'deploy-dev / e2e'

/** The newest run (runs are newest first) whose deploy-dev smoke check passed, or undefined. */
export const devDeploy = async (runs, jobsOf) => {
  for (const run of runs) {
    const jobs = await jobsOf(run.id)
    if (jobs.find((job) => job.name === SMOKE_JOB)?.conclusion === 'success') {
      return { runId: run.id, sha: run.head_sha, e2e: jobs.find((job) => job.name === E2E_JOB)?.conclusion }
    }
  }
  return undefined
}

/** The commits of `log` that claim `key`, in the log's order. */
export const commitsClaiming = (log, key) => log.filter((commit) => claimedKeys(commit.message).includes(key))

/** The folders `files` are in: two levels under src/, the top level elsewhere. */
export const areasOf = (files) => {
  const areas = files.map((file) => {
    const parts = file.split('/')
    return parts[0] === 'src' && parts.length > 2 ? `src/${parts[1]}` : parts[0]
  })
  return [...new Set(areas)].sort((a, b) => a.localeCompare(b, 'en'))
}

const prOf = (message) => message.split('\n', 1)[0].match(/\(#(\d+)\)$/)?.[1]

/** One issue's line. `commits` are newest first, each with the files it changed. */
export const candidateRow = (issue, commits, devSha, isDescendant) => {
  const row = {
    ...issue,
    commit: commits[0]?.sha.slice(0, 8) ?? '-',
    prs: commits.map((c) => prOf(c.message)).filter(Boolean).map((n) => `#${n}`),
    areas: areasOf(commits.flatMap((c) => c.files)),
  }
  if (commits.length === 0) return { ...row, onDev: 'no commit' }
  if (!devSha) return { ...row, onDev: 'no deploy' }
  // Main is linear, so the newest claiming commit being deployed means all of them are.
  return { ...row, onDev: isDescendant(commits[0].sha, devSha) ? 'yes' : 'no' }
}

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

/** The .env of this checkout, or of the main checkout when this is a worktree without one. */
const envFile = (root) => {
  const own = path.join(root, '.env')
  if (existsSync(own)) return own
  const main = run('git', ['-C', root, 'worktree', 'list', '--porcelain']).split('\n')[0].replace(/^worktree /, '')
  return path.join(main, '.env')
}

const searchIssues = async (request, jql) => {
  const issues = []
  let token
  do {
    const params = new URLSearchParams({ jql, fields: 'summary,status', maxResults: '100' })
    if (token) params.set('nextPageToken', token)
    const response = await request(`/rest/api/3/search/jql?${params}`)
    if (!response.ok) throw new Error(`Jira search failed (${response.status}): ${await response.text()}`)
    const page = await response.json()
    for (const issue of page.issues) {
      issues.push({ key: issue.key, status: issue.fields.status.name, summary: issue.fields.summary })
    }
    token = page.nextPageToken
  } while (token)
  return issues
}

/** `git log --format=%H%x00%B%x1e` output as [{ sha, message }]: a NUL ends the sha, an RS the entry. */
export const parseLog = (text) =>
  text
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, message = ''] = entry.split('\0')
      return { sha, message: message.trim() }
    })

const mainLog = () => parseLog(run('git', ['log', 'origin/main', '--format=%H%x00%B%x1e']))

const main = async () => {
  const keys = process.argv.slice(2).map((key) => key.toUpperCase())
  const root = run('git', ['rev-parse', '--show-toplevel']).trim()
  process.loadEnvFile(envFile(root))
  const credentials = credentialsFromEnv()
  if (!credentials) throw new Error('JIRA_USER_EMAIL and JIRA_API_TOKEN missing from .env')
  const request = jiraClient(credentials)

  // The local clone lags main; the commit and the deploy must both be in it.
  run('git', ['fetch', '--quiet', 'origin', 'main'])

  const runs = JSON.parse(
    run('gh', [
      'run', 'list', '--workflow', 'ci.yml', '--branch', 'main', '--event', 'push', '--status', 'completed',
      '--limit', '30', '--json', 'databaseId,headSha',
    ])
  ).map((r) => ({ id: r.databaseId, head_sha: r.headSha }))
  const deploy = await devDeploy(runs, async (id) => JSON.parse(run('gh', ['run', 'view', String(id), '--json', 'jobs'])).jobs)

  console.log(
    deploy
      ? `# dev deploy: run ${deploy.runId} at ${deploy.sha.slice(0, 8)}, e2e ${deploy.e2e ?? 'not run'}`
      : '# dev deploy: none among the last 30 main runs'
  )

  const jql = keys.length
    ? `key in (${keys.join(', ')}) ORDER BY key ASC`
    : 'project = KOE AND status = "Ready for Testing" ORDER BY updated ASC'
  const issues = await searchIssues(request, jql)
  const log = mainLog()

  for (const issue of issues) {
    const commits = commitsClaiming(log, issue.key).map((commit) => ({
      ...commit,
      files: run('git', ['show', '--name-only', '--format=', commit.sha]).split('\n').filter(Boolean),
    }))
    const row = candidateRow(issue, commits, deploy?.sha, isGitDescendant)
    console.log(
      [row.key, row.status, row.onDev, row.commit, row.prs.join(',') || '-', row.areas.join(',') || '-', row.summary].join(
        '\t'
      )
    )
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
