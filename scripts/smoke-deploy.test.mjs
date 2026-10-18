import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  checkApi,
  checkFrontPage,
  expectations,
  gitVersionAt,
  isGitDescendant,
  readStamp,
  stampProblems,
} from './smoke-deploy.mjs'

const REVISION = 'a'.repeat(40)
const NEWER = 'b'.repeat(40)
const API = 'https://abc.execute-api.eu-north-1.amazonaws.com/dev'
const SCRIPT = path.join(import.meta.dirname, 'smoke-deploy.mjs')

const page = ({ version = '1.2.3', revision = REVISION, api = API } = {}) =>
  [
    '<!doctype html><html lang="fi"><head>',
    version === null ? '' : `<meta name="app-version" content="${version}">`,
    revision === null ? '' : `<meta name="app-revision" content="${revision}">`,
    api === null ? '' : `<link rel="preconnect" href="${api}">`,
    '</head><body></body></html>',
  ].join('')

const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } })
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Answers each call with the next response; the last one repeats. */
const fetchSequence = (...responses) => {
  const fetch = vi.fn(async () => (responses.length > 1 ? responses.shift() : responses[0].clone()))
  return fetch
}

const sleep = vi.fn(async () => {})
/** A clone in which no served commit follows the expected one. */
const strictGit = { isDescendant: () => false, versionAt: () => undefined }
/** A clone in which every served commit follows the expected one, at the given version. */
const laterGit = (version = '1.2.3') => ({ isDescendant: vi.fn(() => true), versionAt: vi.fn(() => version) })

describe('readStamp', () => {
  it('reads the version, the revision and the API the page preconnects to', () => {
    expect(readStamp(page())).toEqual({ api: API, revision: REVISION, version: '1.2.3' })
  })

  it('reads attributes the minifier left unquoted', () => {
    const minified = `<meta name=app-version content=1.2.3><meta name=app-revision content=${REVISION}><link rel=preconnect href=${API}>`
    expect(readStamp(minified)).toEqual({ api: API, revision: REVISION, version: '1.2.3' })
  })

  it('finds the stamp among the other tags of a built head', () => {
    // The order and the attributes of the build's own head (public/index.html, minified).
    const head = [
      '<head><meta charset="utf-8"/>',
      '<meta name="viewport" content="width=device-width,initial-scale=1"/>',
      '<meta name="theme-color" content="#000000"/>',
      '<meta name="app-version" content="1.2.3"/>',
      `<meta name="app-revision" content="${REVISION}"/>`,
      '<meta name="description" content="Suomen Noutajakoirajärjestön Koekalenteri"/>',
      '<link rel="icon" href="/favicon.ico"/>',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>',
      '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
      '<link rel="manifest" href="/manifest.json"/>',
      '<title>SNJ Koekalenteri</title>',
      `<link rel="preconnect" href="${API}"/>`,
      '</head>',
    ].join('')
    expect(readStamp(head)).toEqual({ api: API, revision: REVISION, version: '1.2.3' })
  })

  it('leaves out what the page does not carry', () => {
    expect(readStamp('<html><head><title>SNJ Koekalenteri</title></head></html>')).toEqual({})
  })
})

describe('stampProblems', () => {
  const expected = { api: API, revision: REVISION, version: '1.2.3' }
  const fromMain = { ...expected, allowDescendant: true }

  it('accepts a page built from the expected commit', () => {
    expect(stampProblems(readStamp(page()), expected, strictGit)).toEqual([])
  })

  it('accepts anything when nothing is expected (a backend-only deploy)', () => {
    expect(stampProblems({}, {}, strictGit)).toEqual([])
  })

  it.each([
    ['a missing version', { version: null }, 'no app-version meta'],
    ['a missing revision', { revision: null }, 'no app-revision meta'],
    ['another version', { version: '1.2.2' }, 'version 1.2.2, expected 1.2.3'],
    ['another revision', { revision: NEWER }, `revision ${NEWER}, expected ${REVISION}`],
    ['a build that could not read its commit', { revision: 'unknown' }, `revision unknown, expected ${REVISION}`],
    ['a page without the preconnect link', { api: null }, 'no preconnect link'],
    ['another API', { api: 'https://old.example/dev' }, `preconnects to https://old.example/dev, expected ${API}`],
  ])('rejects %s', (_, stamp, problem) => {
    expect(stampProblems(readStamp(page(stamp)), expected, strictGit)).toEqual([problem])
  })

  it('treats a trailing slash on the API URL as the same URL', () => {
    expect(stampProblems(readStamp(page({ api: `${API}/` })), expected, strictGit)).toEqual([])
  })

  it('accepts a newer revision only when descendants are allowed and git says it is one', () => {
    const stamp = readStamp(page({ revision: NEWER }))
    const git = laterGit()

    expect(stampProblems(stamp, expected, git)).toEqual([`revision ${NEWER}, expected ${REVISION}`])
    expect(git.isDescendant).not.toHaveBeenCalled()

    expect(stampProblems(stamp, fromMain, git)).toEqual([])
    expect(git.isDescendant).toHaveBeenCalledWith(REVISION, NEWER)
  })

  it('accepts a later commit on main that bumped the version', () => {
    const git = laterGit('1.3.0')
    expect(stampProblems(readStamp(page({ revision: NEWER, version: '1.3.0' })), fromMain, git)).toEqual([])
    expect(git.versionAt).toHaveBeenCalledWith(NEWER)
  })

  it('rejects a later commit whose page carries another version than its package.json', () => {
    const stamp = readStamp(page({ revision: NEWER, version: '1.2.3' }))
    expect(stampProblems(stamp, fromMain, laterGit('1.3.0'))).toEqual(['version 1.2.3, expected 1.3.0'])
  })

  it('rejects a later commit whose package.json git cannot read', () => {
    const git = { isDescendant: () => true, versionAt: () => undefined }
    expect(stampProblems(readStamp(page({ revision: NEWER })), fromMain, git)).toEqual([
      `no package.json version at ${NEWER}`,
    ])
  })

  it('rejects an older revision even when descendants are allowed', () => {
    const stamp = readStamp(page({ revision: NEWER }))
    expect(stampProblems(stamp, fromMain, strictGit)).toEqual([
      `revision ${NEWER}, expected ${REVISION} or a later commit`,
    ])
  })

  it('never asks git about a revision that is not a commit id', () => {
    const git = laterGit()
    const stamp = readStamp(page({ revision: 'unknown' }))
    expect(stampProblems(stamp, fromMain, git)).toEqual([`revision unknown, expected ${REVISION} or a later commit`])
    expect(git.isDescendant).not.toHaveBeenCalled()
  })
})

describe('the local clone', () => {
  it('counts a commit as following itself', () => {
    expect(isGitDescendant('HEAD', 'HEAD')).toBe(true)
  })

  it('does not count a commit the clone does not have', () => {
    expect(isGitDescendant('HEAD', 'deadbeef'.repeat(5))).toBe(false)
  })

  it('reads the package.json version of a commit', () => {
    // The checked-out version stands in for HEAD's: the working tree is HEAD plus edits, and a
    // commit that changes the version changes both.
    const committed = gitVersionAt('HEAD')
    expect(committed).toMatch(/^\d+\.\d+\.\d+/)
    expect(committed).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version)
  })

  it('has no version for a commit it does not have', () => {
    expect(gitVersionAt('deadbeef'.repeat(5))).toBeUndefined()
  })
})

describe('expectations', () => {
  it('trims the values it is given', () => {
    expect(
      expectations({ 'allow-descendant': true, 'expect-revision': ` ${REVISION}\n`, 'expect-version': '1.2.3 ' })
    ).toEqual({ allowDescendant: true, revision: REVISION, version: '1.2.3' })
  })

  it('expects nothing that is not asked for', () => {
    expect(expectations({})).toEqual({})
  })

  it.each(['expect-version', 'expect-revision', 'expect-api'])('rejects an empty --%s', (option) => {
    // A job output that never got set arrives as an empty string; it must not skip the check.
    expect(() => expectations({ [option]: ' ' })).toThrow(`--${option} is empty`)
    expect(() => expectations({ [option]: '' })).toThrow(`--${option} is empty`)
  })
})

describe('checkFrontPage', () => {
  const options = {
    attempts: 3,
    expected: { revision: REVISION, version: '1.2.3' },
    git: strictGit,
    interval: 1,
    sleep,
    url: 'https://koekalenteri.example/',
  }

  it('passes on the first answer that carries the expected stamp', async () => {
    const fetch = fetchSequence(html(page()))
    await expect(checkFrontPage({ ...options, fetch })).resolves.toEqual(readStamp(page()))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('asks past the CDN cache', async () => {
    const fetch = fetchSequence(html(page()))
    await checkFrontPage({ ...options, fetch })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/koekalenteri\.example\/\?smoke=\d+-1$/),
      expect.objectContaining({ headers: { 'cache-control': 'no-cache' } })
    )
  })

  it('waits out an old page while the CDN catches up', async () => {
    const fetch = fetchSequence(html(page({ revision: NEWER })), html('', 503), html(page()))
    await expect(checkFrontPage({ ...options, fetch })).resolves.toEqual(readStamp(page()))
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(1)
  })

  it('fails with what it last saw once the attempts run out', async () => {
    const fetch = fetchSequence(html(page({ version: '1.2.2' })))
    await expect(checkFrontPage({ ...options, fetch })).rejects.toThrow(
      'front page after 3 attempts: version 1.2.2, expected 1.2.3'
    )
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('fails on a front page that does not load', async () => {
    const fetch = fetchSequence(html('Not found', 404))
    await expect(checkFrontPage({ ...options, expected: {}, fetch })).rejects.toThrow(
      'front page after 3 attempts: HTTP 404'
    )
  })

  it('fails on an answer that is not HTML', async () => {
    const fetch = fetchSequence(json({ message: 'Forbidden' }))
    await expect(checkFrontPage({ ...options, expected: {}, fetch })).rejects.toThrow(
      'front page after 3 attempts: content-type application/json, expected text/html'
    )
  })

  it('counts a network error as a failed attempt', async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(html(page()))
    await expect(checkFrontPage({ ...options, fetch })).resolves.toEqual(readStamp(page()))
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe('checkApi', () => {
  const options = { api: API, attempts: 2, interval: 1, sleep }

  it('passes on an event list', async () => {
    const fetch = fetchSequence(json([{ id: 'event' }]))
    await expect(checkApi({ ...options, fetch })).resolves.toBe(1)
    expect(fetch).toHaveBeenCalledWith(`${API}/event`, expect.anything())
  })

  it('joins a base URL that ends in a slash', async () => {
    const fetch = fetchSequence(json([]))
    await checkApi({ ...options, api: `${API}/`, fetch })
    expect(fetch).toHaveBeenCalledWith(`${API}/event`, expect.anything())
  })

  it('fails on an error answer', async () => {
    const fetch = fetchSequence(json({ message: 'Internal server error' }, 502))
    await expect(checkApi({ ...options, fetch })).rejects.toThrow('GET /event after 2 attempts: HTTP 502')
  })

  it('fails on an answer that is not a list', async () => {
    const fetch = fetchSequence(json({ events: [] }))
    await expect(checkApi({ ...options, fetch })).rejects.toThrow(
      'GET /event after 2 attempts: the answer is not a JSON array'
    )
  })
})

describe('the command line', () => {
  let dir
  let file

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'smoke-deploy-'))
    file = path.join(dir, 'index.html')
    writeFileSync(file, page())
  })

  afterAll(() => rmSync(dir, { force: true, recursive: true }))

  const run = (...args) => spawnSync(process.execPath, [SCRIPT, '--html', file, ...args], { encoding: 'utf8' })

  it('passes a build carrying the expected stamp', () => {
    const result = run('--expect-version', '1.2.3', '--expect-revision', REVISION, '--expect-api', API)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`version 1.2.3, revision ${REVISION}`)
  })

  it('fails a build carrying another version', () => {
    const result = run('--expect-version', '1.2.4')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('version 1.2.3, expected 1.2.4')
  })

  it('fails on an expectation that never got a value', () => {
    const result = run('--expect-revision', '')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--expect-revision is empty')
  })
})
