import type { KcIdLookupCriteria } from './kcTrial'
import { vi } from 'vitest'
import KLIntegraatio from './KLIntegraatio'
import kokeetNOU from './KLIntegraatio-fixtures/kokeet-NOU.json'
import { searchKcTrials } from './kcTrial'

vi.mock('./secrets', () => ({ getKLIntegraatioConfig: async () => ({}) }))

const config = {
  KL_API_PWD: 'pwd',
  KL_API_UID: 'uid',
  KL_INT_API_URL: 'https://rajapinta.example.test/Testi2/',
  KL_INT_SSO_URL: 'https://sso.example.test/token',
}

const criteria: KcIdLookupCriteria = {
  classes: [],
  endDate: '2026-09-27T20:59:59.999Z',
  eventType: 'NOU',
  location: 'Laukaa',
  name: '',
  organizer: { id: 'org-id' },
  startDate: '2026-09-25T21:00:00.000Z',
}

/** A server that takes the request and says nothing until the caller gives up. */
const hang = (signal?: AbortSignal | null) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason))
  })

/** The token comes, the list comes or does not, and every Koe/Lue says nothing. */
const fakeFetch = (listAnswers: boolean) => (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  if (url.includes('sso.example.test')) {
    return Promise.resolve(Response.json({ access_token: 't', expires_in: 3600, token_type: 'Bearer' }))
  }
  if (url.includes('Koe/Kokeet') && listAnswers) return Promise.resolve(Response.json(kokeetNOU))
  return hang(init?.signal)
}

describe('searchKcTrials under the caller’s time', () => {
  const patient = () => new KLIntegraatio(async () => config, { timeoutMs: 60_000 })

  beforeAll(() => {
    // The client logs a call it gave up, which these tests cause on purpose.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('gives up the list when the caller does, as a service that did not answer', async () => {
    vi.stubGlobal('fetch', fakeFetch(false))

    await expect(
      searchKcTrials(patient(), criteria, 400294, { signal: AbortSignal.timeout(30) })
    ).rejects.toMatchObject({ status: 502 })
  })

  it('gives up the read of a trial’s details when the caller does, and answers with what the list gave', async () => {
    vi.stubGlobal('fetch', fakeFetch(true))

    const choices = await searchKcTrials(patient(), criteria, 400294, { signal: AbortSignal.timeout(80) })

    expect(choices.length).toBeGreaterThan(0)
    expect(choices.some((choice) => choice.kcGuid)).toEqual(true)
  })
})
