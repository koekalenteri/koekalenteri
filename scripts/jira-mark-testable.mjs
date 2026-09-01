// Tells the Jira issues named in the pushed commits that their changes are now deployed to dev
// and testable: moves an issue still in a development state to Ready for Testing, and leaves a
// comment naming the deployed commits. Runs after the CI deploy-dev job has succeeded, because a
// pushed commit is only testable once the pipeline is through.
//
// Usage: node scripts/jira-mark-testable.mjs [--dry-run] <base-sha> <head-sha>
// Env:   JIRA_USER_EMAIL, JIRA_API_TOKEN, JIRA_BASE_URL (default https://koekalenteri.atlassian.net)
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const [base, head] = args.filter((arg) => arg !== '--dry-run')

if (!base || !head) {
  console.error('usage: jira-mark-testable.mjs [--dry-run] <base-sha> <head-sha>')
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

// Only an issue still on the development side of the board is moved; Ready for Testing and
// Testing In Progress keep their place (the tester may already be on it), and a done issue is
// left entirely alone — a refactor naming a closed ticket must not stir it.
const DEVELOPMENT_STATUSES = new Set(['Backlog', 'Selected for Development', 'In Progress'])
const TARGET_STATUS = 'Ready for Testing'

/**
 * Only the keys a commit claims as its own: the subject line, or a body line of nothing but keys
 * (the repo's footer convention). A key cited mid-sentence is context — "the KOE-85 gate" names a
 * neighbouring feature, not work now testable — and moving that issue would be wrong.
 */
const claimedKeys = (message) => {
  const [subject, ...body] = message.split('\n')
  const keys = new Set(subject.match(/KOE-\d+/g) ?? [])
  for (const line of body) {
    const trimmed = line.trim()
    if (trimmed && /^(KOE-\d+[\s,]*)+$/.test(trimmed)) {
      for (const key of trimmed.match(/KOE-\d+/g) ?? []) keys.add(key)
    }
  }
  return [...keys]
}

/** KOE-72 -> [{ sha, subject }] of the pushed commits that named the key. */
const commitsByIssue = new Map()

for (const commit of git('rev-list', '--reverse', `${base}..${head}`).split('\n').filter(Boolean)) {
  const message = git('log', '-1', '--format=%B', commit)
  const keys = claimedKeys(message)
  if (keys.length === 0) continue

  const entry = { sha: commit.slice(0, 8), subject: message.split('\n', 1)[0] }
  for (const key of keys) {
    const list = commitsByIssue.get(key) ?? []
    list.push(entry)
    commitsByIssue.set(key, list)
  }
}

if (commitsByIssue.size === 0) {
  console.log('no issue keys named in', `${base}..${head}`)
  process.exit(0)
}

const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`

const request = async (path, init = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: auth, 'Content-Type': 'application/json', ...init.headers },
  })
  // An expired token must fail the run loudly; a missing issue only skips itself below.
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Jira refused the credentials (${response.status})`)
  }
  return response
}

/** One comment per issue per push: the deployed commits, as an ADF bullet list. */
const commentBody = (commits) => ({
  body: {
    content: [
      {
        content: [{ text: 'Puskettu deviin ja testattavissa (CI läpi):', type: 'text' }],
        type: 'paragraph',
      },
      {
        content: commits.map(({ sha, subject }) => ({
          content: [
            {
              content: [
                { marks: [{ type: 'code' }], text: sha, type: 'text' },
                { text: ` ${subject}`, type: 'text' },
              ],
              type: 'paragraph',
            },
          ],
          type: 'listItem',
        })),
        type: 'bulletList',
      },
    ],
    type: 'doc',
    version: 1,
  },
})

for (const [key, commits] of commitsByIssue) {
  if (dryRun) {
    console.log(`would mark ${key} testable for: ${commits.map((commit) => commit.sha).join(', ')}`)
    continue
  }

  const issue = await request(`/rest/api/3/issue/${key}?fields=status`)
  if (!issue.ok) {
    console.warn(`skipping ${key}: ${issue.status}`)
    continue
  }

  const { fields } = await issue.json()
  const status = fields.status?.name ?? ''
  if (fields.status?.statusCategory?.key === 'done') {
    console.log(`leaving ${key} alone: already ${status}`)
    continue
  }

  if (DEVELOPMENT_STATUSES.has(status)) {
    const transitions = await request(`/rest/api/3/issue/${key}/transitions`)
    const target = transitions.ok
      ? (await transitions.json()).transitions?.find((transition) => transition.to?.name === TARGET_STATUS)
      : undefined
    if (target) {
      const moved = await request(`/rest/api/3/issue/${key}/transitions`, {
        body: JSON.stringify({ transition: { id: target.id } }),
        method: 'POST',
      })
      if (moved.ok) console.log(`moved ${key} from ${status} to ${TARGET_STATUS}`)
      else console.warn(`failed to move ${key}: ${moved.status} ${await moved.text()}`)
    } else {
      console.warn(`no transition from ${status} to ${TARGET_STATUS} on ${key}`)
    }
  }

  const commented = await request(`/rest/api/3/issue/${key}/comment`, {
    body: JSON.stringify(commentBody(commits)),
    method: 'POST',
  })
  if (commented.ok) console.log(`commented on ${key}: ${commits.map((commit) => commit.sha).join(', ')}`)
  else console.warn(`failed to comment on ${key}: ${commented.status} ${await commented.text()}`)
}
