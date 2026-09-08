/** What the scripts that talk to Jira share: reading issue keys off commits, and the REST client. */

/**
 * Only the keys a commit claims as its own: the subject line, or a body line of nothing but keys
 * (the repo's footer convention). A key cited mid-sentence is context — "the KOE-85 gate" names a
 * neighbouring feature, not work now testable — and moving that issue would be wrong.
 */
export const claimedKeys = (message) => {
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

export const DEFAULT_BASE_URL = 'https://koekalenteri.atlassian.net'

/** The credentials the environment holds, or nothing — a script decides itself what to do without. */
export const credentialsFromEnv = () => {
  const email = process.env.JIRA_USER_EMAIL
  const token = process.env.JIRA_API_TOKEN
  return email && token ? { baseUrl: process.env.JIRA_BASE_URL ?? DEFAULT_BASE_URL, email, token } : undefined
}

/** A fetch against the Jira site that fails loudly on refused credentials. */
export const jiraClient = ({ baseUrl, email, token }) => {
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`

  return async (path, init = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: auth, 'Content-Type': 'application/json', ...init.headers },
    })
    // An expired token must fail the run loudly; a missing issue only skips itself in the caller.
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Jira refused the credentials (${response.status})`)
    }
    return response
  }
}
