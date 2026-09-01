// Attaches changed visual-test baselines to the Jira issues named in the commits that changed
// them, so a ticket always carries the current look of the components it covers.
//
// Usage: node scripts/jira-attach-screenshots.mjs [--dry-run] <base-sha> <head-sha>
// Env:   JIRA_USER_EMAIL, JIRA_API_TOKEN, JIRA_BASE_URL (default https://koekalenteri.atlassian.net)
//
// Pairing is per commit: a commit's own KOE-keys get that commit's own changed baselines. Only the
// linux baselines are sent -- both platforms change together (scripts/checkChartScreenshots.js
// enforces it), so sending one of the pair is enough. An attachment replaces any earlier one with
// the same name, so a ticket shows one current image per component rather than a pile of versions.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [base, head] = args.filter((arg) => arg !== '--dry-run')

if (!base || !head) {
  console.error('usage: jira-attach-screenshots.mjs [--dry-run] <base-sha> <head-sha>')
  process.exit(2)
}

const baseUrl = process.env.JIRA_BASE_URL ?? 'https://koekalenteri.atlassian.net'
const email = process.env.JIRA_USER_EMAIL
const token = process.env.JIRA_API_TOKEN

if (!dryRun && (!email || !token)) {
  console.error('JIRA_USER_EMAIL and JIRA_API_TOKEN must be set')
  process.exit(2)
}

const git = (...gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' })

const LINUX_BASELINE = /__screenshots__\/.*-chromium-linux\.png$/

/** KOE-72 -> Set of baseline paths, paired within the commit that named the key. */
const filesByIssue = new Map()

for (const commit of git('rev-list', '--reverse', `${base}..${head}`).split('\n').filter(Boolean)) {
  const keys = [...new Set(git('log', '-1', '--format=%B', commit).match(/KOE-\d+/g) ?? [])]
  if (keys.length === 0) continue

  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)
    .split('\n')
    // A deleted baseline has nothing to attach.
    .filter((file) => LINUX_BASELINE.test(file) && existsSync(file))

  for (const key of keys) {
    const set = filesByIssue.get(key) ?? new Set()
    for (const file of files) set.add(file)
    if (set.size) filesByIssue.set(key, set)
  }
}

if (filesByIssue.size === 0) {
  console.log('no screenshot changes paired with issue keys in', `${base}..${head}`)
  process.exit(0)
}

const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: auth, 'X-Atlassian-Token': 'no-check', ...init.headers },
  })
  // An expired token must fail the run loudly; a missing issue only skips itself below.
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Jira refused the credentials (${response.status})`)
  }
  return response
}

/** The name the image carries on the ticket: the baseline's own, minus the platform suffix. */
const attachmentName = (file) => basename(file).replace('-chromium-linux', '')

for (const [key, files] of filesByIssue) {
  for (const file of files) {
    const name = attachmentName(file)
    if (dryRun) {
      console.log(`would attach ${file} to ${key} as ${name}`)
      continue
    }

    const issue = await request(`/rest/api/3/issue/${key}?fields=attachment`)
    if (!issue.ok) {
      console.warn(`skipping ${key}: ${issue.status}`)
      break
    }

    // Replace rather than accumulate: the ticket should show the current look, not every version.
    const { fields } = await issue.json()
    for (const existing of fields.attachment ?? []) {
      if (existing.filename === name) await request(`/rest/api/3/attachment/${existing.id}`, { method: 'DELETE' })
    }

    const form = new FormData()
    form.append('file', new Blob([readFileSync(file)], { type: 'image/png' }), name)
    const upload = await request(`/rest/api/3/issue/${key}/attachments`, { body: form, method: 'POST' })

    if (upload.ok) console.log(`attached ${name} to ${key}`)
    else console.warn(`failed to attach ${name} to ${key}: ${upload.status} ${await upload.text()}`)
  }
}
