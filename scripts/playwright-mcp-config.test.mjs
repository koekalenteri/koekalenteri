import { readFileSync } from 'node:fs'
import path from 'node:path'

// Claude's browser (KOE-1731) may reach dev only. The allowlist is the only thing keeping it off
// production, so a production origin on it is refused here before review has to catch it.
const CONFIG = path.join(import.meta.dirname, '..', '.claude', 'playwright-mcp.json')
const PRODUCT_DOMAIN = 'koekalenteri.snj.fi'
const ALLOWED_PRODUCT_HOSTS = new Set([`dev.${PRODUCT_DOMAIN}`])

const allowedOrigins = () => JSON.parse(readFileSync(CONFIG, 'utf8')).network.allowedOrigins

/** Why an entry is not a bare origin, or undefined when it is one. */
const originProblem = (entry) => {
  if (entry.includes('*')) return 'a wildcard'
  let url
  try {
    url = new URL(entry)
  } catch {
    return 'not a URL'
  }
  if (url.protocol !== 'https:' && url.protocol !== 'wss:') return `the scheme ${url.protocol}`
  if (url.port !== '' || /:\d+$/.test(entry)) return 'a port'
  if (url.origin !== entry) return 'a path, query or trailing slash'
  return undefined
}

/** Why a host must stay off the list, or undefined when it may be on it. */
const hostProblem = (host) => {
  const isProductHost = host === PRODUCT_DOMAIN || host.endsWith(`.${PRODUCT_DOMAIN}`)
  if (isProductHost && !ALLOWED_PRODUCT_HOSTS.has(host)) return `${host} is not dev`
  return undefined
}

describe('the allowlist checks', () => {
  it.each([
    ['https://dev.example.fi/', 'a path, query or trailing slash'],
    ['https://dev.example.fi/login', 'a path, query or trailing slash'],
    ['https://dev.example.fi:8443', 'a port'],
    ['https://dev.example.fi:443', 'a port'],
    ['https://*.example.fi', 'a wildcard'],
    ['http://dev.example.fi', 'the scheme http:'],
    ['dev.example.fi', 'not a URL'],
  ])('refuses %s as %s', (entry, problem) => {
    expect(originProblem(entry)).toBe(problem)
  })

  it.each(['koekalenteri.snj.fi', 'auth.koekalenteri.snj.fi', 'auth-dev.koekalenteri.snj.fi', 'test.koekalenteri.snj.fi'])(
    'refuses the host %s',
    (host) => {
      expect(hostProblem(host)).toBe(`${host} is not dev`)
    }
  )

  it.each(['dev.koekalenteri.snj.fi', 'services.paytrail.com', 'notkoekalenteri.snj.fi'])('accepts the host %s', (host) => {
    expect(hostProblem(host)).toBeUndefined()
  })
})

// The server resolves a relative outputDir against its working directory, the repository root
// where Claude Code starts it, so its own files (snapshots, console logs) land in the folder git
// ignores and never in the root.
describe('Playwright MCP output', () => {
  it('goes to the git-ignored .playwright-mcp folder', () => {
    expect(JSON.parse(readFileSync(CONFIG, 'utf8')).outputDir).toBe('.playwright-mcp')
    const ignored = readFileSync(path.join(import.meta.dirname, '..', '.gitignore'), 'utf8').split('\n')
    expect(ignored).toContain('/.playwright-mcp/')
  })
})

describe('Playwright MCP allowlist', () => {
  it('lists origins', () => {
    expect(allowedOrigins().length).toBeGreaterThan(0)
  })

  it.each(allowedOrigins())('%s is a bare origin', (entry) => {
    expect(originProblem(entry)).toBeUndefined()
  })

  it.each(allowedOrigins())('%s is no production or auth host of the service', (entry) => {
    expect(hostProblem(new URL(entry).hostname)).toBeUndefined()
  })
})
