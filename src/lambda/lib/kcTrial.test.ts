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
  endDate: '2026-09-27',
  eventType: 'NOU',
  location: 'Laukaa',
  name: '',
  organizer: { id: 'org-id' },
  startDate: '2026-09-26',
}

/** A server that takes the request and says nothing until the caller gives up. */
const hang = (signal?: AbortSignal | null) =>
  new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason))
  })

/** The token comes, the list comes or does not, and every Koe/Lue says nothing. */
const fakeFetch = (listAnswers: boolean | 'empty first') => {
  let lists = 0
  return (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('sso.example.test')) {
      return Promise.resolve(Response.json({ access_token: 't', expires_in: 3600, token_type: 'Bearer' }))
    }
    if (url.includes('Koe/Kokeet')) {
      lists++
      // The first list is empty, which is what widens the search by a week: the second says nothing.
      if (listAnswers === 'empty first' && lists === 1) {
        return Promise.resolve(Response.json({ virheet: ['Ei tulosta'] }, { status: 404 }))
      }
      if (listAnswers === true) return Promise.resolve(Response.json(kokeetNOU))
    }
    return hang(init?.signal)
  }
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

  it('gives up the second list, the one with a week’s margin, when the caller does', async () => {
    vi.stubGlobal('fetch', fakeFetch('empty first'))

    await expect(
      searchKcTrials(patient(), criteria, 400294, { signal: AbortSignal.timeout(50) })
    ).rejects.toMatchObject({ status: 502 })
  })

  it('gives up the read of a trial’s details when the caller does, and answers with what the list gave', async () => {
    vi.stubGlobal('fetch', fakeFetch(true))

    const choices = await searchKcTrials(patient(), criteria, 400294, { signal: AbortSignal.timeout(80) })

    expect(choices.length).toBeGreaterThan(0)
    expect(choices.some((choice) => choice.kcGuid)).toEqual(true)
  })
})

describe('searchKcTrials ranking a one-day trial', () => {
  const oneDay: KcIdLookupCriteria = {
    ...criteria,
    endDate: '2026-09-26',
    name: 'Syyskoe',
    startDate: '2026-09-26',
  }
  const listing = { ...kokeetNOU[0], alku: '2026-09-26T00:00:00', koeGUID: null }
  // Two days at the event's place: it scores on the place, and misses on the last day.
  const twoDaysAtTheEventsPlace = {
    ...listing,
    loppu: '2026-09-27T00:00:00',
    paikkakunta: 'Laukaa',
    tapahtuma: 'Kevät',
  }

  /** The token comes and the list is the listings given; none has a GUID, so nothing is read with Koe/Lue. */
  const listFetch = (listings: unknown[]) => (input: string | URL | Request) =>
    Promise.resolve(
      String(input).includes('sso.example.test')
        ? Response.json({ access_token: 't', expires_in: 3600, token_type: 'Bearer' })
        : Response.json(listings)
    )

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    { loppu: '2026-09-26T00:00:00', name: 'its first day as the end' },
    { loppu: '', name: 'no end at all' },
    { loppu: '0001-01-01T00:00:00', name: "KL's empty date as the end" },
  ])('ranks a listing with $name as ending on its first day', async ({ loppu }) => {
    const oneDayElsewhere = { ...listing, loppu, paikkakunta: 'Jyväskylä', tapahtuma: 'Syyskoe' }
    vi.stubGlobal('fetch', listFetch([twoDaysAtTheEventsPlace, oneDayElsewhere]))

    const choices = await searchKcTrials(new KLIntegraatio(async () => config), oneDay, 400294)

    expect(choices.map((choice) => choice.name)).toEqual(['Syyskoe', 'Kevät'])
  })
})
