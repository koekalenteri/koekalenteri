#!/usr/bin/env node
// The post-deploy smoke check (KOE-1368): after release.yml has deployed an environment, the front
// page must load and carry the stamp of the build this run made, and the public event list must
// answer. A deploy whose front page does not load is a red release run, not a user's report.
//
//   node scripts/smoke-deploy.mjs --url https://<domain>/ --api <api base> \
//     [--expect-version 1.2.3] [--expect-revision <sha>] [--expect-api <api base>] [--allow-descendant]
//   node scripts/smoke-deploy.mjs --html build/index.html --expect-version 1.2.3 --expect-revision <sha>
//
// The stamp is two meta tags index.html gets at build time (config/webpack.config.js): the
// package.json version, and the commit the build was made from. The version alone cannot tell a
// fresh page from an old one, since many commits share a version; the revision can. `--allow-descendant`
// is for dev, where main may move between the deploy job's checkout and Amplify's clone: a later
// commit on main is then the right build too, an earlier one never is.
// `--html` checks a local build instead, which CI does on every frontend build so that a template or
// minifier change cannot drop the stamp unnoticed until the next release.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const COMMIT_ID = /^[0-9a-f]{40}$/
const REQUEST_TIMEOUT_MS = 15_000

/** The value of one attribute of a tag, quoted either way or not at all. */
const attribute = (tag, name) =>
  new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i')
    .exec(tag)
    ?.slice(1)
    .find((value) => value !== undefined)

const metaContent = (html, name) => {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attribute(tag, 'name') !== name) continue
    return attribute(tag, 'content')
  }
  return undefined
}

const preconnectHref = (html) => {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (attribute(tag, 'rel') !== 'preconnect') continue
    return attribute(tag, 'href')
  }
  return undefined
}

/** The scripts the page loads from its own origin, as absolute URLs. */
export function scriptSources(html, pageUrl) {
  const origin = new URL(pageUrl).origin
  return [...html.matchAll(/<script\b[^>]*>/gi)]
    .map(([tag]) => attribute(tag, 'src'))
    .filter((src) => src !== undefined)
    .map((src) => new URL(src, pageUrl))
    .filter((url) => url.origin === origin)
    .map((url) => url.href)
}

/** What a built index.html says about itself; a missing part is left out. */
export function readStamp(html) {
  const stamp = {}
  const version = metaContent(html, 'app-version')
  const revision = metaContent(html, 'app-revision')
  const api = preconnectHref(html)
  if (version !== undefined) stamp.version = version
  if (revision !== undefined) stamp.revision = revision
  if (api !== undefined) stamp.api = api
  return stamp
}

const withoutTrailingSlash = (url) => url.replace(/\/+$/, '')

/**
 * How the served revision relates to the expected one: `{ problem }` when it is not acceptable,
 * `{ descendant: true }` when it is a later commit on main that `--allow-descendant` lets through.
 */
function checkRevision(served, expected, git) {
  if (served === undefined) return { problem: 'no app-revision meta' }
  if (served === expected.revision) return {}
  if (!expected.allowDescendant) return { problem: `revision ${served}, expected ${expected.revision}` }
  // Only a commit id goes to git: the value comes from a web page.
  if (COMMIT_ID.test(served) && git.isDescendant(expected.revision, served)) return { descendant: true }
  return { problem: `revision ${served}, expected ${expected.revision} or a later commit` }
}

function versionProblem(served, expectedVersion, revisionCheck, git, servedRevision) {
  if (served === undefined) return 'no app-version meta'
  // A later commit is the right build only with its own version: main may have bumped it meanwhile.
  const wanted = revisionCheck.descendant ? git.versionAt(servedRevision) : expectedVersion
  if (wanted === undefined) return `no package.json version at ${servedRevision}`
  if (served === wanted) return undefined
  return `version ${served}, expected ${wanted}`
}

/**
 * Every way the stamp differs from what this deploy built. Each expectation is checked only when
 * given: a backend-only deploy built no frontend, so it expects nothing of the stamp. `git` answers
 * `isDescendant(ancestor, revision)` and `versionAt(revision)` from the local clone.
 */
export function stampProblems(stamp, expected, git) {
  const problems = []
  const revisionCheck = expected.revision === undefined ? {} : checkRevision(stamp.revision, expected, git)
  if (expected.version !== undefined) {
    const problem = versionProblem(stamp.version, expected.version, revisionCheck, git, stamp.revision)
    if (problem) problems.push(problem)
  }
  if (revisionCheck.problem) problems.push(revisionCheck.problem)
  if (expected.api !== undefined) {
    if (stamp.api === undefined) problems.push('no preconnect link')
    else if (withoutTrailingSlash(stamp.api) !== withoutTrailingSlash(expected.api))
      problems.push(`preconnects to ${stamp.api}, expected ${expected.api}`)
  }
  return problems
}

/** Whether `revision` is `ancestor` or a commit after it, by the local clone's history. */
export function isGitDescendant(ancestor, revision) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, revision], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** The package.json version at `revision` in the local clone, or undefined when git cannot tell. */
export function gitVersionAt(revision) {
  try {
    const text = execFileSync('git', ['show', `${revision}:package.json`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pkg = JSON.parse(text)
    return typeof pkg.version === 'string' ? pkg.version : undefined
  } catch {
    return undefined
  }
}

export const localGit = { isDescendant: isGitDescendant, versionAt: gitVersionAt }

/**
 * Runs `attempt` until it reports no problems or the attempts run out. Each attempt answers with
 * `{ problems, value }`; a thrown error (a network failure, a timeout) counts as a failed attempt.
 */
async function retry({ attempts, interval, sleep, label }, attempt, number = 1) {
  let result
  try {
    result = await attempt(number)
  } catch (error) {
    result = { problems: [error instanceof Error ? error.message : String(error)] }
  }
  if (result.problems.length === 0) return result.value
  console.log(`${label}, attempt ${number}/${attempts}: ${result.problems.join('; ')}`)
  if (number >= attempts) {
    throw new Error(`${label} after ${attempts} attempts: ${result.problems.join('; ')}`)
  }
  await sleep(interval)
  return retry({ attempts, interval, label, sleep }, attempt, number + 1)
}

/**
 * Fetches the front page until it carries the expected stamp. Right after Amplify reports the job
 * done, the CDN may still answer with the previous page for a while, hence the retries; the query
 * string and the request header ask past any cache that honours them.
 */
export function checkFrontPage({ url, expected, fetch, sleep, attempts, interval, git }) {
  const runId = Date.now()
  return retry({ attempts, interval, label: 'front page', sleep }, async (number) => {
    const target = new URL(url)
    target.searchParams.set('smoke', `${runId}-${number}`)
    const response = await fetch(target.href, {
      headers: { 'cache-control': 'no-cache' },
      redirect: 'follow',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status !== 200) return { problems: [`HTTP ${response.status}`] }
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('text/html')) return { problems: [`content-type ${type}, expected text/html`] }
    const page = await response.text()
    const stamp = readStamp(page)
    const problems = stampProblems(stamp, expected, git)
    if (problems.length) return { problems }
    return { problems: await scriptProblems(scriptSources(page, target.href), fetch), value: stamp }
  })
}

/**
 * An index.html whose bundle does not load is a blank page, so every script it names must answer
 * as JavaScript. Amplify's rewrite leaves `.js` paths alone, so a missing bundle is a 404; the type
 * is checked too, so that an index.html served in its place cannot pass.
 */
async function scriptProblems(sources, fetch) {
  if (sources.length === 0) return ['the page loads no script']
  const answers = await Promise.all(
    sources.map(async (source) => {
      const response = await fetch(source, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
      const path = new URL(source).pathname
      if (response.status !== 200) return `${path}: HTTP ${response.status}`
      const type = response.headers.get('content-type') ?? ''
      if (!type.includes('javascript')) return `${path}: content-type ${type}, expected JavaScript`
      return undefined
    })
  )
  return answers.filter((problem) => problem !== undefined)
}

/** Fetches the public event list, which needs no sign-in and reads the event table. */
export function checkApi({ api, fetch, sleep, attempts, interval }) {
  const target = `${withoutTrailingSlash(api)}/event`
  return retry({ attempts, interval, label: 'GET /event', sleep }, async () => {
    const response = await fetch(target, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    if (response.status !== 200) return { problems: [`HTTP ${response.status}`] }
    const body = await response.json()
    if (!Array.isArray(body)) return { problems: ['the answer is not a JSON array'] }
    return { problems: [], value: body.length }
  })
}

/** The `--expect-*` options as the expectations `stampProblems` takes. */
export function expectations(values) {
  const expected = {}
  for (const [key, option] of [
    ['version', 'expect-version'],
    ['revision', 'expect-revision'],
    ['api', 'expect-api'],
  ]) {
    const value = values[option]
    if (value === undefined) continue
    // An empty expectation is a job output that never got set, not a wish to skip the check.
    if (value.trim() === '') throw new Error(`--${option} is empty`)
    expected[key] = value.trim()
  }
  if (values['allow-descendant']) expected.allowDescendant = true
  return expected
}

const describeStamp = (stamp) =>
  `version ${stamp.version ?? '-'}, revision ${stamp.revision ?? '-'}, api ${stamp.api ?? '-'}`

async function main() {
  const { values } = parseArgs({
    options: {
      'allow-descendant': { type: 'boolean' },
      api: { type: 'string' },
      attempts: { default: '12', type: 'string' },
      'expect-api': { type: 'string' },
      'expect-revision': { type: 'string' },
      'expect-version': { type: 'string' },
      html: { type: 'string' },
      interval: { default: '15', type: 'string' },
      url: { type: 'string' },
    },
  })
  const expected = expectations(values)

  if (values.html) {
    const stamp = readStamp(readFileSync(values.html, 'utf8'))
    const problems = stampProblems(stamp, expected, localGit)
    if (problems.length) throw new Error(`${values.html}: ${problems.join('; ')}`)
    console.log(`${values.html}: ${describeStamp(stamp)}`)
    return
  }

  if (!values.url || !values.api) throw new Error('--url and --api are required (or --html)')
  const attempts = Number(values.attempts)
  const interval = Number(values.interval) * 1000
  const common = { fetch: globalThis.fetch, interval, sleep: delay }

  const stamp = await checkFrontPage({ ...common, attempts, expected, git: localGit, url: values.url })
  console.log(`front page ${values.url}: ${describeStamp(stamp)}`)
  const count = await checkApi({ ...common, api: values.api, attempts: 3 })
  console.log(`GET /event: ${count} events`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(`::error::Smoke check failed: ${error.message}`)
    process.exit(1)
  })
}
