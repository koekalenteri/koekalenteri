import { getIdTokenDiagnostics, getJwtExpiresAt, isValidIdToken } from './token'

const encodeBase64Url = (value: string) => btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
const makeToken = (payload: object) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('token', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2026-07-24T12:00:00.000Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('reads JWT expiration time', () => {
    const token = makeToken({ exp: 1_782_733_200 })

    expect(getJwtExpiresAt(token)).toBe(1_782_733_200_000)
  })

  it('only accepts JWTs with an expiration time in the future', () => {
    expect(isValidIdToken(makeToken({ exp: Date.now() / 1000 + 60 }))).toBe(true)
    expect(isValidIdToken(makeToken({ exp: Date.now() / 1000 - 1 }))).toBe(false)
    expect(isValidIdToken(makeToken({}))).toBe(false)
    expect(isValidIdToken('not-a-jwt')).toBe(false)
    expect(isValidIdToken(`header.${encodeBase64Url(JSON.stringify({ exp: Date.now() / 1000 + 60 }))}`)).toBe(false)
  })

  it('returns safe diagnostics without including token contents', () => {
    const token = makeToken({ exp: Date.now() / 1000 + 60, iat: Date.now() / 1000 })

    const diagnostics = getIdTokenDiagnostics(token)

    expect(diagnostics).toEqual({
      expiresAt: '2026-07-24T12:01:00.000Z',
      expiresInMs: 60_000,
      fingerprint: expect.stringMatching(/^[a-f0-9]{8}$/),
      issuedAt: '2026-07-24T12:00:00.000Z',
    })
    expect(JSON.stringify(diagnostics)).not.toContain(token)
  })
})
