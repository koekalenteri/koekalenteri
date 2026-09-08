#!/usr/bin/env node

/**
 * The release-time guide update, as one run: what changed since the last release, which guide
 * pages that concerns, and what the issues behind the change say -- gathered into a brief for the
 * agent session that rewrites the pages with the developer present.
 *
 * The brief is computed from the repository and Jira, never from memory of what happened along
 * the way: the same command gives the same brief whoever made the commits. The agent's rules for
 * the writing itself are `docs/AGENTS.md`; the brief only says what this release is about.
 *
 * Usage: docs-update.mjs [--since <ref>] [--staged] [--run]
 *   --since <ref>  the release to diff from; the latest tag by default
 *   --staged       the staged change instead of a release range (the pre-commit hint's big sibling)
 *   --run          start `claude` with the brief instead of printing it
 * Env:   JIRA_USER_EMAIL, JIRA_API_TOKEN for the issues' titles and the open guide issues
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { loadPages, pagesCovering, SOURCE_LANGUAGE } from './lib/docs.mjs'
import { claimedKeys, credentialsFromEnv, jiraClient } from './lib/jira.mjs'

const args = process.argv.slice(2)
const staged = args.includes('--staged')
const run = args.includes('--run')
const sinceIndex = args.indexOf('--since')
const git = (...gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()

/** The release to diff from: the one named, or else the latest tag. */
const sinceRef = () => (sinceIndex >= 0 ? args[sinceIndex + 1] : git('describe', '--tags', '--abbrev=0'))
const since = staged ? undefined : sinceRef()
if (!staged && !since) {
  console.error('usage: docs-update.mjs [--since <ref>] [--staged] [--run]')
  process.exit(2)
}

// ---- the change -------------------------------------------------------------------------------

const files = (
  staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMRD') : git('diff', '--name-only', `${since}..HEAD`)
)
  .split('\n')
  .filter(Boolean)

const commits = staged
  ? []
  : git('log', '--reverse', '--format=%h%x00%s%x00%b%x01', `${since}..HEAD`)
      .split('\x01')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [sha, subject, body] = entry.split('\x00')
        return { keys: claimedKeys(`${subject}\n${body ?? ''}`), sha, subject }
      })

const issueKeys = [...new Set(commits.flatMap((commit) => commit.keys))]

const { pages } = await loadPages()
const code = files.filter((file) => file.startsWith('src/'))
const touched = pagesCovering(pages, code)
const changedShots = files.filter((file) => file.includes('__screenshots__') && file.endsWith('-chromium-linux.png'))
const shotRef = (file) => {
  const [, testDir, png] = /__screenshots__\/([^/]+)\.visual\.test\.tsx\/(.+)-chromium-linux\.png$/.exec(file) ?? []
  return testDir ? `${testDir}/${png}` : undefined
}
const pagesWithChangedShots = pages.filter(
  (page) => page.language === SOURCE_LANGUAGE && changedShots.some((file) => page.shots.includes(shotRef(file)))
)
const changedDocs = files.filter((file) => file.startsWith('docs/'))

// ---- what Jira says ---------------------------------------------------------------------------

const credentials = credentialsFromEnv()
const issues = new Map()
const guideIssues = []
if (credentials) {
  const request = jiraClient(credentials)
  for (const key of issueKeys) {
    const response = await request(`/rest/api/3/issue/${key}?fields=summary,status`)
    if (response.ok) {
      const { fields } = await response.json()
      issues.set(key, { status: fields.status.name, summary: fields.summary })
    }
  }
  const jql = 'project = KOE AND labels = ohje AND statusCategory != Done ORDER BY created'
  const response = await request(`/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status`)
  if (response.ok) {
    for (const issue of (await response.json()).issues ?? []) {
      guideIssues.push({ key: issue.key, status: issue.fields.status.name, summary: issue.fields.summary })
    }
  }
}

// ---- the brief --------------------------------------------------------------------------------

const range = staged ? 'the staged change' : `${since}..HEAD`
const lines = [
  `# Guide update for ${range}`,
  '',
  'Update the guides under docs/ for this change. Read docs/AGENTS.md first: it says who reads',
  'the guides, how they bind to the code, and what you must not do. Work through the pages',
  'listed below and nothing else; a page not listed is not part of this release.',
  '',
  '## Pages this change concerns',
  '',
]
if (touched.length === 0) {
  lines.push('No guide page covers the changed code. If the change is user-visible, say so and stop:')
  lines.push('a new page is a decision for the developer, not a side effect of this run.')
} else {
  for (const page of touched) {
    const hits = code.filter((file) => pagesCovering([page], [file]).length)
    lines.push(`- ${page.file} (${page.title}) — because of ${hits.join(', ')}`)
  }
}
if (pagesWithChangedShots.length) {
  lines.push('', '## Pages whose pictures changed', '')
  for (const page of pagesWithChangedShots) {
    const shots = changedShots.map(shotRef).filter((ref) => page.shots.includes(ref))
    lines.push(`- ${page.file}: ${shots.join(', ')} — look at the new picture and check the text still matches it`)
  }
}
if (changedDocs.length) {
  lines.push('', '## Guide files already changed in this range', '', ...changedDocs.map((file) => `- ${file}`))
}
if (commits.length) {
  lines.push('', `## Commits in ${range}`, '')
  for (const commit of commits) {
    lines.push(`- ${commit.sha} ${commit.subject}`)
  }
}
if (issueKeys.length) {
  lines.push('', '## Issues the commits claim', '')
  for (const key of issueKeys) {
    const issue = issues.get(key)
    lines.push(issue ? `- ${key} ${issue.summary} (${issue.status})` : `- ${key}`)
  }
  if (!credentials) lines.push('', '(Set JIRA_USER_EMAIL and JIRA_API_TOKEN to have the titles fetched.)')
}
if (guideIssues.length) {
  lines.push('', '## Open guide issues (label "ohje")', '')
  for (const issue of guideIssues) lines.push(`- ${issue.key} ${issue.summary} (${issue.status})`)
}
lines.push(
  '',
  '## When done',
  '',
  '- `npm run build-docs`, then `npm run check-docs`; both must pass',
  '- every changed Finnish page has its English translation updated and its `sourceHash` renewed',
  '- anything you could not settle is a `TODO` line in the page, listed for the developer',
  '- for a release: `npm run release-notes -- v<next>` drafts docs/<language>/uutta/<next>.md; write it in',
  "  the reader's words in both languages — the version bump cannot be committed without it"
)

const brief = lines.join('\n')

if (!run) {
  console.log(brief)
  process.exit(0)
}

const result = spawnSync('claude', [brief], { stdio: 'inherit' })
if (result.error) {
  console.error(`could not start claude (${result.error.message}); the brief follows\n\n${brief}`)
  process.exit(1)
}
process.exit(result.status ?? 0)
