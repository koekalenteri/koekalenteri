import { execFile, execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  checkApi,
  checkFrontPage,
  expectations,
  gitVersionAt,
  isGitDescendant,
  readStamp,
  scriptSources,
  stampProblems,
} from './smoke-deploy.mjs'

const REVISION = 'a'.repeat(40)
const NEWER = 'b'.repeat(40)
const API = 'https://abc.execute-api.eu-north-1.amazonaws.com/dev'
const BUNDLE = '/static/js/9121.81d6a2ac.js'
const CLI = path.join(import.meta.dirname, 'smoke-deploy.mjs')

const page = ({ version = '1.2.3', revision = REVISION, api = API, scripts = [BUNDLE] } = {}) =>
  [
    '<!doctype html><html lang="fi"><head>',
    version === null ? '' : `<meta name="app-version" content="${version}">`,
    revision === null ? '' : `<meta name="app-revision" content="${revision}">`,
    api === null ? '' : `<link rel="preconnect" href="${api}">`,
    ...scripts.map((src) => `<script defer="defer" src="${src}"></script>`),
    '</head><body></body></html>',
  ].join('')

const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html' } })
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const js = (status = 200) => new Response('void 0', { status, headers: { 'content-type': 'application/javascript' } })

/** Answers each call with the next response; the last one repeats. */
const fetchSequence = (...responses) => {
  const fetch = vi.fn(async () => (responses.length > 1 ? responses.shift() : responses[0].clone()))
  return fetch
}

const sleep = vi.fn(async () => {})
beforeEach(() => sleep.mockClear())
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
    // Against the committed file, not the working tree: a release bump may be staged but not yet in.
    const committed = JSON.parse(execFileSync('git', ['show', 'HEAD:package.json'], { encoding: 'utf8' })).version
    expect(gitVersionAt('HEAD')).toBe(committed)
    expect(committed).toMatch(/^\d+\.\d+\.\d+/)
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

describe('scriptSources', () => {
  const url = 'https://koekalenteri.example/?smoke=1-1'

  it('resolves the scripts the page loads against its URL', () => {
    const scripts = page({ scripts: [BUNDLE, 'static/js/relative.js'] })
    expect(scriptSources(scripts, url)).toEqual([
      `https://koekalenteri.example${BUNDLE}`,
      'https://koekalenteri.example/static/js/relative.js',
    ])
  })

  it('leaves out inline scripts and scripts from another origin', () => {
    const scripts = `${page({ scripts: ['https://cdn.example/x.js'] })}<script>void 0</script>`
    expect(scriptSources(scripts, url)).toEqual([])
  })
})

describe('checkFrontPage', () => {
  const PAGE = 'https://koekalenteri.example/'
  const options = {
    attempts: 3,
    expected: { revision: REVISION, version: '1.2.3' },
    git: strictGit,
    interval: 1,
    sleep,
    url: PAGE,
  }

  /** The front page answers from `pages`; every other URL from `files`, or 404 as Amplify does for a `.js`. */
  const site = (pages, files = { [`https://koekalenteri.example${BUNDLE}`]: () => js() }) =>
    vi.fn(async (url, init) => (url.startsWith(`${PAGE}?`) ? pages(url, init) : (files[url]?.() ?? js(404))))

  it('passes on the first answer that carries the expected stamp and loads its scripts', async () => {
    const pages = fetchSequence(html(page()))
    const fetch = site(pages)
    await expect(checkFrontPage({ ...options, fetch })).resolves.toEqual(readStamp(page()))
    expect(pages).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(`https://koekalenteri.example${BUNDLE}`, expect.anything())
    expect(sleep).not.toHaveBeenCalled()
  })

  it('asks past the CDN cache', async () => {
    const pages = fetchSequence(html(page()))
    await checkFrontPage({ ...options, fetch: site(pages) })
    expect(pages).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/koekalenteri\.example\/\?smoke=\d+-1$/),
      expect.objectContaining({ headers: { 'cache-control': 'no-cache' } })
    )
  })

  it('waits out an old page while the CDN catches up', async () => {
    const pages = fetchSequence(html(page({ revision: NEWER })), html('', 503), html(page()))
    await expect(checkFrontPage({ ...options, fetch: site(pages) })).resolves.toEqual(readStamp(page()))
    expect(pages).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1)
  })

  it('fails with what it last saw once the attempts run out, without a sleep after the last', async () => {
    const pages = fetchSequence(html(page({ version: '1.2.2' })))
    await expect(checkFrontPage({ ...options, fetch: site(pages) })).rejects.toThrow(
      'front page after 3 attempts: version 1.2.2, expected 1.2.3'
    )
    expect(pages).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('fails on a page whose bundle is missing', async () => {
    const fetch = site(fetchSequence(html(page())), {})
    await expect(checkFrontPage({ ...options, fetch })).rejects.toThrow(
      `front page after 3 attempts: ${BUNDLE}: HTTP 404`
    )
  })

  it('fails on a bundle answered with a page', async () => {
    const fetch = site(fetchSequence(html(page())), {
      [`https://koekalenteri.example${BUNDLE}`]: () => html(page()),
    })
    await expect(checkFrontPage({ ...options, fetch })).rejects.toThrow(
      `front page after 3 attempts: ${BUNDLE}: content-type text/html, expected JavaScript`
    )
  })

  it('fails on a page that loads no script', async () => {
    const fetch = site(fetchSequence(html(page({ scripts: [] }))))
    await expect(checkFrontPage({ ...options, fetch })).rejects.toThrow(
      'front page after 3 attempts: the page loads no script'
    )
  })

  it('fails on a front page that does not load', async () => {
    const fetch = site(fetchSequence(html('Not found', 404)))
    await expect(checkFrontPage({ ...options, expected: {}, fetch })).rejects.toThrow(
      'front page after 3 attempts: HTTP 404'
    )
  })

  it('fails on an answer that is not HTML', async () => {
    const fetch = site(fetchSequence(json({ message: 'Forbidden' })))
    await expect(checkFrontPage({ ...options, expected: {}, fetch })).rejects.toThrow(
      'front page after 3 attempts: content-type application/json, expected text/html'
    )
  })

  it('counts a network error as a failed attempt', async () => {
    const pages = vi.fn().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(html(page()))
    await expect(checkFrontPage({ ...options, fetch: site(pages) })).resolves.toEqual(readStamp(page()))
    expect(pages).toHaveBeenCalledTimes(2)
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

describe('the command line against a server', () => {
  let server
  let origin
  let frontStatus = 200

  beforeAll(async () => {
    server = createServer((request, response) => {
      const { pathname } = new URL(request.url, 'http://localhost')
      if (pathname === '/') {
        response.writeHead(frontStatus, { 'content-type': 'text/html' })
        response.end(page({ api: `${origin}/api` }))
      } else if (pathname === BUNDLE) {
        response.writeHead(200, { 'content-type': 'application/javascript' })
        response.end('void 0')
      } else if (pathname === '/api/event') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('[{"id":"a"},{"id":"b"}]')
      } else {
        response.writeHead(404)
        response.end()
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    origin = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(() => new Promise((resolve) => server.close(resolve)))

  /** Runs the script without blocking this process, which serves its requests. */
  const run = (...args) =>
    new Promise((resolve) => {
      execFile(process.execPath, [CLI, ...args], { encoding: 'utf8' }, (error, stdout, stderr) =>
        resolve({ status: error ? error.code : 0, stderr, stdout })
      )
    })

  it('passes a deploy whose page carries the stamp, loads its bundle and whose API answers', async () => {
    frontStatus = 200
    const result = await run(
      ...['--url', `${origin}/`, '--api', `${origin}/api`, '--attempts', '1', '--interval', '0'],
      ...['--expect-version', '1.2.3', '--expect-revision', REVISION, '--expect-api', `${origin}/api`]
    )
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`version 1.2.3, revision ${REVISION}`)
    expect(result.stdout).toContain('GET /event: 2 events')
  })

  it('fails a deploy whose front page does not load', async () => {
    frontStatus = 503
    const result = await run('--url', `${origin}/`, '--api', `${origin}/api`, '--attempts', '1', '--interval', '0')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('::error::Smoke check failed: front page after 1 attempts: HTTP 503')
  })

  it('refuses to run without the API', async () => {
    const result = await run('--url', `${origin}/`)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('--url and --api are required')
  })
})

describe('the command line on a build', () => {
  let dir
  let file

  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'smoke-deploy-'))
    file = path.join(dir, 'index.html')
    writeFileSync(file, page())
  })

  afterAll(() => rmSync(dir, { force: true, recursive: true }))

  const run = (...args) => spawnSync(process.execPath, [CLI, '--html', file, ...args], { encoding: 'utf8' })

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
