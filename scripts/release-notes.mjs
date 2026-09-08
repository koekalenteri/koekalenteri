#!/usr/bin/env node

/**
 * Drafts a release's notes, `docs/<language>/uutta/<version>.md`, from the commits since the
 * previous release.
 *
 * The draft is scaffolding, not the notes: commit subjects grouped by what they were (features,
 * fixes, speed), each with the issues it claims and, given Jira credentials, their titles. The
 * notes themselves are written in the reader's words over this draft, in both languages, before
 * the version bump -- `npm run check-docs` refuses a package.json version without them, and the
 * `TODO` lines left here keep showing up in its output until they are gone.
 *
 * Usage: release-notes.mjs v1.11.3 [--since <tag>] [--force]
 * Env:   JIRA_USER_EMAIL, JIRA_API_TOKEN for the issues' titles
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { digest, NOTES_PATH, SOURCE_LANGUAGE } from './lib/docs.mjs'
import { claimedKeys, credentialsFromEnv, jiraClient } from './lib/jira.mjs'

const args = process.argv.slice(2)
const force = args.includes('--force')
const sinceIndex = args.indexOf('--since')
const version = args.find((arg) => /^v?\d+\.\d+\.\d+$/.test(arg))?.replace(/^v/, '')

if (!version) {
  console.error('usage: release-notes.mjs v1.11.3 [--since <tag>] [--force]')
  process.exit(2)
}

const git = (...gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' }).trim()
const since = sinceIndex >= 0 ? args[sinceIndex + 1] : git('describe', '--tags', '--abbrev=0')

const LANGUAGES = [SOURCE_LANGUAGE, 'en']
const files = Object.fromEntries(LANGUAGES.map((language) => [language, `docs/${language}/${NOTES_PATH}/${version}.md`]))

const existing = Object.values(files).filter((file) => existsSync(file))
if (existing.length && !force) {
  console.error(`${existing.join(' and ')} already exist${existing.length === 1 ? 's' : ''}; pass --force to overwrite`)
  process.exit(1)
}

// ---- the commits, by what they were -----------------------------------------------------------

/** Conventional commit types a reader cares about, with the heading each draft puts them under. */
const SECTIONS = {
  feat: { en: 'New', fi: 'Uutta' },
  fix: { en: 'Fixed', fi: 'Korjattu' },
  perf: { en: 'Faster', fi: 'Nopeampaa' },
}

const commits = git('log', '--reverse', '--format=%h%x00%s%x00%b%x01', `${since}..HEAD`)
  .split('\x01')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const [sha, subject, body] = entry.split('\x00')
    const match = /^(\w+)(?:\([^)]*\))?!?: (.*)$/.exec(subject)
    return {
      keys: claimedKeys(`${subject}\n${body ?? ''}`),
      sha,
      text: match?.[2] ?? subject,
      type: match?.[1],
    }
  })
  .filter((commit) => commit.type in SECTIONS)

const credentials = credentialsFromEnv()
const titles = new Map()
if (credentials) {
  const request = jiraClient(credentials)
  for (const key of new Set(commits.flatMap((commit) => commit.keys))) {
    const response = await request(`/rest/api/3/issue/${key}?fields=summary`)
    if (response.ok) titles.set(key, (await response.json()).fields.summary)
  }
}

const bullet = (commit) => {
  const issues = commit.keys.map((key) => (titles.has(key) ? `${key} ${titles.get(key)}` : key))
  return `- ${commit.text} (${commit.sha}${issues.length ? `; ${issues.join(', ')}` : ''})`
}

const TODO = {
  en: 'TODO: translate the Finnish notes; this draft is the same commit list',
  fi: 'TODO: kirjoita lukijan sanoin, mitä koekalenterissa muuttui — alla on luonnos commiteista',
}

const draft = (language) => {
  const lines = [TODO[language], '']
  for (const [type, headings] of Object.entries(SECTIONS)) {
    const ofType = commits.filter((commit) => commit.type === type)
    if (!ofType.length) continue
    lines.push(`## ${headings[language]}`, '', ...ofType.map(bullet), '')
  }
  if (commits.length === 0) lines.push(`(no feat, fix or perf commits in ${since}..HEAD)`, '')

  return lines.join('\n')
}

const today = new Date().toISOString().slice(0, 10)
const sourceBody = draft(SOURCE_LANGUAGE)

for (const language of LANGUAGES) {
  const body = language === SOURCE_LANGUAGE ? sourceBody : draft(language)
  const frontmatter = [`date: ${today}`, ...(language === SOURCE_LANGUAGE ? [] : [`sourceHash: ${digest(sourceBody)}`])]
  mkdirSync(dirname(files[language]), { recursive: true })
  writeFileSync(files[language], `---\n${frontmatter.join('\n')}\n---\n\n${body}`)
  console.log(`✍️  ${files[language]}`)
}

console.log(
  `Drafted ${version} from ${commits.length} commits in ${since}..HEAD. Write the notes over the draft in both ` +
    'languages, renew the English sourceHash, then `npm run build-docs`.'
)
