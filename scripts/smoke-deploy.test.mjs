import { checkApi, checkFrontPage, readStamp, stampProblems } from './smoke-deploy.mjs'

const REVISION = 'a'.repeat(40)
const NEWER = 'b'.repeat(40)
const API = 'https://abc.execute-api.eu-north-1.amazonaws.com/dev'

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
const notDescendant = () => false

describe('readStamp', () => {
  it('reads the version, the revision and the API the page preconnects to', () => {
    expect(readStamp(page())).toEqual({ api: API, revision: REVISION, version: '1.2.3' })
  })

  it('reads attributes the minifier left unquoted', () => {
    const minified = `<meta name=app-version content=1.2.3><meta name=app-revision content=${REVISION}><link rel=preconnect href=${API}>`
    expect(readStamp(minified)).toEqual({ api: API, revision: REVISION, version: '1.2.3' })
  })

  it('leaves out what the page does not carry', () => {
    expect(readStamp('<html><head><title>SNJ Koekalenteri</title></head></html>')).toEqual({})
  })
})

describe('stampProblems', () => {
  const expected = { api: API, revision: REVISION, version: '1.2.3' }

  it('accepts a page built from the expected commit', () => {
    expect(stampProblems(readStamp(page()), expected, notDescendant)).toEqual([])
  })

  it('accepts anything when nothing is expected (a backend-only deploy)', () => {
    expect(stampProblems({}, {}, notDescendant)).toEqual([])
  })

  it.each([
    ['a missing version', { version: null }, 'no app-version meta'],
    ['a missing revision', { revision: null }, 'no app-revision meta'],
    ['another version', { version: '1.2.2' }, 'version 1.2.2, expected 1.2.3'],
    ['another revision', { revision: NEWER }, `revision ${NEWER}, expected ${REVISION}`],
    ['a build that could not read its commit', { revision: 'unknown' }, `revision unknown, expected ${REVISION}`],
    ['a page without the preconnect link', { api: null }, 'no preconnect link'],
    ['another API',{ api: 'https://old.example/dev' }, `preconnects to https://old.example/dev, expected ${API}`],
  ])('rejects %s', (_, stamp, problem) => {
    expect(stampProblems(readStamp(page(stamp)), expected, notDescendant)).toEqual([problem])
  })

  it('treats a trailing slash on the API URL as the same URL', () => {
    expect(stampProblems(readStamp(page({ api: `${API}/` })), expected, notDescendant)).toEqual([])
  })

  it('accepts a newer revision only when descendants are allowed and git says it is one', () => {
    const stamp = readStamp(page({ revision: NEWER }))
    const isDescendant = vi.fn(() => true)

    expect(stampProblems(stamp, expected, isDescendant)).toEqual([`revision ${NEWER}, expected ${REVISION}`])
    expect(isDescendant).not.toHaveBeenCalled()

    expect(stampProblems(stamp, { ...expected, allowDescendant: true }, isDescendant)).toEqual([])
    expect(isDescendant).toHaveBeenCalledWith(REVISION, NEWER)
  })

  it('rejects an older revision even when descendants are allowed', () => {
    const stamp = readStamp(page({ revision: NEWER }))
    expect(stampProblems(stamp, { ...expected, allowDescendant: true }, notDescendant)).toEqual([
      `revision ${NEWER}, expected ${REVISION} or a later commit`,
    ])
  })

  it('never asks git about a revision that is not a commit id', () => {
    const isDescendant = vi.fn(() => true)
    const stamp = readStamp(page({ revision: 'unknown' }))
    expect(stampProblems(stamp, { ...expected, allowDescendant: true }, isDescendant)).toEqual([
      `revision unknown, expected ${REVISION} or a later commit`,
    ])
    expect(isDescendant).not.toHaveBeenCalled()
  })
})

describe('checkFrontPage', () => {
  const options = {
    attempts: 3,
    expected: { revision: REVISION, version: '1.2.3' },
    interval: 1,
    isDescendant: notDescendant,
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
