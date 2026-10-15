import type { JsonEventType, JsonUser, Organizer } from '../../types'
import type { KLIntegraatioResult, KLIntKoe, KLIntKoeListassa } from '../types/KLIntegraatio'
import { vi } from 'vitest'
import kokeetNOU from '../lib/KLIntegraatio-fixtures/kokeet-NOU.json'
import lueNOU from '../lib/KLIntegraatio-fixtures/lue-NOU.json'
import { constructAPIGwEvent } from '../test-utils/helpers'

vi.useFakeTimers()
const TEST_NOW = new Date('2026-06-01T12:00:00.000Z')

const mockAuthorizeWithMemberOf = vi.fn<() => Promise<{ memberOf: string[]; user: JsonUser }>>()
const mockReadOrganizer = vi.fn<() => Promise<Organizer | undefined>>()
const mockReadEventType = vi.fn<() => Promise<JsonEventType | undefined>>()
const mockRead = vi.fn((key: Record<string, unknown>) =>
  'eventType' in key ? mockReadEventType() : mockReadOrganizer()
)
const mockResponse = vi.fn<(status: number, body: unknown, event: unknown) => unknown>()
const mockLueKokeet = vi.fn<(params: unknown) => Promise<KLIntegraatioResult<KLIntKoeListassa[]>>>()
const mockLueKoe = vi.fn<(params: { koeGuid?: string }) => Promise<KLIntegraatioResult<KLIntKoe>>>()
const mockGetKLIntegraatio = vi.fn(() => ({ lueKoe: mockLueKoe, lueKokeet: mockLueKokeet }))

class MockLambdaError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

vi.doMock('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

vi.doMock('../lib/KLIntegraatio', () => ({
  getKLIntegraatio: mockGetKLIntegraatio,
}))

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  LambdaError: MockLambdaError,
  lambda: vi.fn((_name, fn) => fn),
  response: mockResponse,
}))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {
      read: mockRead,
    }
  }),
}))

const { default: searchEventKcIdChoicesLambda } = await import('./handler')

const user: JsonUser = {
  createdAt: '',
  createdBy: '',
  email: 'user@example.com',
  id: 'user-id',
  modifiedAt: '',
  modifiedBy: '',
  name: 'User',
}

// The trial of the real Testi2 samples: Laukaa 26-27.9.2026, organizer 400294, with a GUID.
const laukaaRequest = {
  classes: [{ class: 'ALO', date: '2026-09-25T21:00:00.000Z' }],
  endDate: '2026-09-27T20:59:59.999Z',
  eventType: 'NOU',
  location: 'Laukaa',
  name: '',
  organizer: { id: 'org-id', name: 'Org' },
  startDate: '2026-09-25T21:00:00.000Z',
}

const lookupRequest = {
  ...laukaaRequest,
  endDate: '2026-07-02T20:59:59.999Z',
  eventType: 'NOME-B',
  location: 'Espoo',
  startDate: '2026-07-01T00:00:00.000Z',
}

const organizer: Organizer = {
  id: 'org-id',
  kcId: 400294,
  name: 'Org',
}

const otherOrganizer: Organizer = {
  id: 'org-2',
  kcId: 67890,
  name: 'Other Org',
}

const eventTypeRecord: JsonEventType = {
  createdAt: '',
  createdBy: '',
  description: { en: '', fi: '', sv: '' },
  eventType: 'NOU',
  modifiedAt: '',
  modifiedBy: '',
  official: true,
}

const [tamperePast, laukaa]: KLIntKoeListassa[] = kokeetNOU
const LAUKAA_GUID = '2b81e6a1-559b-407c-87c7-b8a9b89b1987'
const OTHER_GUID = '0a0b27bc-f651-4575-b0aa-b0b16a5ce52d'

const notFound = { status: 404, virheet: ['Ei tulosta'] }

/** What Koe/Lue answers for each GUID. */
const lueByGuid = (answers: Record<string, KLIntKoe>) => {
  mockLueKoe.mockImplementation(async ({ koeGuid }) => {
    const json = koeGuid ? answers[koeGuid] : undefined
    return json ? { json, status: 200 } : { status: 404, virheet: ['Ei tulosta'] }
  })
}

const search = async (body: object = laukaaRequest) => {
  const event = constructAPIGwEvent(body, { method: 'POST' })
  await searchEventKcIdChoicesLambda(event)
  return event
}

const expectResponse = (body: unknown) => expect(mockResponse).toHaveBeenLastCalledWith(200, body, expect.anything())

describe('searchEventKcIdChoicesLambda', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(TEST_NOW)
    vi.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-id'], user })
    mockReadOrganizer.mockResolvedValue(organizer)
    mockReadEventType.mockResolvedValue(eventTypeRecord)
    mockLueKokeet.mockResolvedValue({ json: [laukaa], status: 200 })
    lueByGuid({ [LAUKAA_GUID]: lueNOU })
  })

  afterEach(() => vi.useRealTimers())

  it('uses the shared Integraatio client and does not create one', async () => {
    await search()

    expect(mockGetKLIntegraatio).toHaveBeenCalled()
  })

  it('asks Koe/Kokeet with the organizer number, the koemuoto abbreviation and the days of the event', async () => {
    await search()

    expect(mockRead).toHaveBeenCalledWith({ id: 'org-id' }, expect.anything())
    expect(mockLueKokeet).toHaveBeenCalledTimes(1)
    expect(mockLueKokeet).toHaveBeenCalledWith({
      alku: '2026-09-26',
      koemuoto: 'NOU',
      loppu: '2026-09-27',
      yhdistys: 400294,
    })
  })

  it('uses the number of the requested organizer', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org-id', 'org-2'], user })
    mockReadOrganizer.mockResolvedValueOnce(otherOrganizer)

    await search({ ...laukaaRequest, organizer: { id: 'org-2' } })

    expect(mockRead).toHaveBeenCalledWith({ id: 'org-2' }, expect.anything())
    expect(mockLueKokeet).toHaveBeenCalledWith(expect.objectContaining({ yhdistys: 67890 }))
  })

  it('maps a real Testi2 trial: the GUID from Koe/Kokeet and the details from Koe/Lue', async () => {
    const event = await search()

    expect(mockLueKoe).toHaveBeenCalledTimes(1)
    expect(mockLueKoe).toHaveBeenCalledWith({ koeGuid: LAUKAA_GUID })
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        choices: [
          {
            classes: [],
            contactInfo: { secretary: { email: 'redacted@example.invalid', phone: '000-0000000' } },
            cost: 50,
            description:
              'Etusija järjestävän yhdistyksen jäsenillä, sekä järjestäjän kutsumilla koirilla (max 1/3 osallistujista).Osallistumismaksu jäsenille 45e, muille 50e.\n\nEtusija järjestävän yhdistyksen jäsenillä\n\nMuu määrää koskeva rajoitus - järjestäjän kutsumat koirat max 1/3 osallistujista',
            endDate: '2026-09-27T00:00:00',
            entryEndDate: '2026-09-05T00:00:00',
            entryStartDate: '2026-08-15T00:00:00',
            eventType: 'NOU',
            judge: 'Testi Tuomari',
            judgeId: 1000001,
            kcGuid: LAUKAA_GUID,
            location: 'Laukaa',
            name: '',
            organizer: 'KESKI-SUOMEN NOUTAJAKOIRAYHDISTYS RY.',
            startDate: '2026-09-26T00:00:00',
            status: 'Hyväksytty',
          },
        ],
      },
      event
    )
  })

  it('shows a trial without a GUID with kcGuid null and asks Koe/Lue nothing for it', async () => {
    mockLueKokeet.mockResolvedValue({ json: [tamperePast], status: 200 })

    await search({ ...laukaaRequest, endDate: '2026-06-06T20:59:59.999Z', startDate: '2026-06-05T21:00:00.000Z' })

    expect(mockLueKoe).not.toHaveBeenCalled()
    expectResponse({
      choices: [
        {
          classes: [],
          endDate: '2026-06-06T00:00:00',
          eventType: 'NOU',
          judge: 'Toinen Tuomari',
          judgeId: 1000002,
          kcGuid: null,
          location: 'Tampere',
          name: '',
          organizer: 'PIRKANMAAN NOUTAJAKOIRAYHDISTYS r.y.',
          startDate: '2026-06-06T00:00:00',
          status: 'Valmistunut',
        },
      ],
    })
  })

  it('leaves location out of a choice whose Koe/Lue failed, so it cannot raise a false location warning', async () => {
    mockLueKoe.mockResolvedValue({ status: 500 })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await search()

    expectResponse({
      choices: [expect.not.objectContaining({ location: expect.anything() })],
    })
    expectResponse({ choices: [expect.objectContaining({ kcGuid: LAUKAA_GUID })] })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('drops a trial whose Koe/Lue koemuoto is not the one searched for', async () => {
    lueByGuid({ [LAUKAA_GUID]: { ...lueNOU, koemuoto: 'NOWT' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await search()

    expectResponse({ choices: [] })
    warn.mockRestore()
  })

  it('adds " SM" for a championship, also for a trial without a GUID that has no Koe/Lue', async () => {
    mockLueKokeet.mockResolvedValue({
      json: [{ ...tamperePast, koemuoto: 'Noutajien Working Test', tyyppi: 'SM-koe tai muu mestaruusottelu' }],
      status: 200,
    })

    await search({ ...laukaaRequest, eventType: 'NOWT SM' })

    expect(mockLueKokeet).toHaveBeenCalledWith(expect.objectContaining({ koemuoto: 'NOWT' }))
    expectResponse({ choices: [expect.objectContaining({ eventType: 'NOWT SM' })] })
  })

  it('does not add " SM" to a championship type outside the official list', async () => {
    mockReadEventType.mockResolvedValue({ ...eventTypeRecord, eventType: 'MEJÄ' })
    mockLueKokeet.mockResolvedValue({
      json: [{ ...tamperePast, tyyppi: 'SM-koe tai muu mestaruusottelu' }],
      status: 200,
    })

    await search({ ...laukaaRequest, eventType: 'MEJÄ' })

    expectResponse({ choices: [expect.objectContaining({ eventType: 'MEJÄ' })] })
  })

  describe('classes (dormant: Koe/Lue answers luokat as [] in every Testi2 sample)', () => {
    // CONSTRUCTED, not a real answer: the real lue-NOU.json with luokat set, to prove the path works
    // once Kennelliitto starts filling the list.
    const withClasses = (luokat: string[]): KLIntKoe => ({ ...lueNOU, luokat })

    it('puts the classes of Koe/Lue into the choice', async () => {
      lueByGuid({ [LAUKAA_GUID]: withClasses(['ALO', 'VOI', 'ALO']) })

      await search()

      expectResponse({ choices: [expect.objectContaining({ classes: ['ALO', 'VOI'] })] })
    })

    it('ranks a trial whose classes overlap above one that is otherwise equal', async () => {
      mockLueKokeet.mockResolvedValue({
        json: [{ ...laukaa, koeGUID: OTHER_GUID }, laukaa],
        status: 200,
      })
      lueByGuid({
        [LAUKAA_GUID]: withClasses(['ALO']),
        [OTHER_GUID]: { ...withClasses(['VOI']), koeGUID: OTHER_GUID },
      })

      await search()

      expectResponse({
        choices: [expect.objectContaining({ kcGuid: LAUKAA_GUID }), expect.objectContaining({ kcGuid: OTHER_GUID })],
      })
    })
  })

  it('ranks by the same scoring as before: start date, end date, location and name', async () => {
    mockLueKokeet.mockResolvedValue({
      json: [
        { ...tamperePast, alku: '2026-09-26T00:00:00', loppu: '2026-09-27T00:00:00' },
        { ...laukaa, alku: '2026-09-20T00:00:00', loppu: '2026-09-27T00:00:00' },
        laukaa,
      ],
      status: 200,
    })

    await search()

    expectResponse({
      choices: [
        expect.objectContaining({ kcGuid: LAUKAA_GUID, location: 'Laukaa' }),
        expect.objectContaining({ kcGuid: null, location: 'Tampere' }),
        expect.objectContaining({ kcGuid: LAUKAA_GUID, startDate: '2026-09-20T00:00:00' }),
      ],
    })
  })

  it('expands the search date range when the exact search says "Ei tulosta"', async () => {
    mockLueKokeet.mockResolvedValueOnce(notFound).mockResolvedValueOnce({ json: [laukaa], status: 200 })

    await search({ ...laukaaRequest, eventType: 'NOU' })

    expect(mockLueKokeet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ alku: '2026-09-26', loppu: '2026-09-27' })
    )
    expect(mockLueKokeet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ alku: '2026-09-19', loppu: '2026-10-04' })
    )
    expectResponse({ choices: [expect.objectContaining({ kcGuid: LAUKAA_GUID })] })
  })

  it('widens the search in Finnish days across the change to summer time', async () => {
    mockLueKokeet.mockResolvedValueOnce(notFound).mockResolvedValueOnce({ json: [laukaa], status: 200 })

    // 2.4.2026 is the Thursday after the clocks went forward (29.3.). Seven 24-hour steps back from
    // its midnight, taken in UTC, land on the 25th in Helsinki; seven Finnish days back is the 26th.
    await search({ ...laukaaRequest, endDate: '2026-04-02T20:59:59.999Z', startDate: '2026-04-01T21:00:00.000Z' })

    expect(mockLueKokeet).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ alku: '2026-04-02', loppu: '2026-04-02' })
    )
    expect(mockLueKokeet).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ alku: '2026-03-26', loppu: '2026-04-09' })
    )
  })

  it('returns empty choices when the expanded search also says "Ei tulosta"', async () => {
    mockLueKokeet.mockResolvedValue(notFound)

    const event = await search()

    expect(mockLueKokeet).toHaveBeenCalledTimes(2)
    expect(mockResponse).toHaveBeenCalledWith(200, { choices: [] }, event)
  })

  it('does not take a 404 with other reasons for "no result"', async () => {
    mockLueKokeet.mockResolvedValue({ status: 404, virheet: ['Virheellinen koemuoto'] })

    await expect(search()).rejects.toMatchObject({
      message: expect.stringContaining('Virheellinen koemuoto'),
      status: 404,
    })
    expect(mockLueKokeet).toHaveBeenCalledTimes(1)
  })

  it('refuses with the upstream status when Koe/Kokeet fails', async () => {
    mockLueKokeet.mockResolvedValue({ status: 500 })

    await expect(search()).rejects.toMatchObject({ status: 500 })
  })

  it('answers 502 when Koe/Kokeet cannot be reached', async () => {
    mockLueKokeet.mockResolvedValue({ error: 'fetch failed', status: 0 })

    await expect(search()).rejects.toMatchObject({ message: expect.stringContaining('fetch failed'), status: 502 })
  })

  it('requires selected organizer id', async () => {
    const event = constructAPIGwEvent({ ...lookupRequest, organizer: undefined }, { method: 'POST' })

    await expect(searchEventKcIdChoicesLambda(event)).rejects.toMatchObject({ status: 400 })
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockLueKokeet).not.toHaveBeenCalled()
  })

  it('allows the lookup for an event already run, which is when results are entered (KOE-452)', async () => {
    mockLueKokeet.mockResolvedValue({ json: [tamperePast], status: 200 })
    await search({
      ...lookupRequest,
      classes: [{ class: 'ALO', date: '2026-05-20T00:00:00.000Z' }],
      endDate: '2026-05-21T20:59:59.999Z',
      startDate: '2026-05-20T00:00:00.000Z',
    })

    expect(mockLueKokeet).toHaveBeenCalled()
  })

  it('allows an event type the Kennel Club sync flagged official', async () => {
    mockLueKokeet.mockResolvedValue({ json: [tamperePast], status: 200 })
    mockReadEventType.mockResolvedValueOnce({ ...eventTypeRecord, eventType: 'MEJÄ' })

    await search({ ...lookupRequest, eventType: 'MEJÄ' })

    expect(mockRead).toHaveBeenCalledWith({ eventType: 'MEJÄ' }, expect.anything())
    expect(mockLueKokeet).toHaveBeenCalledWith(expect.objectContaining({ koemuoto: 'MEJÄ' }))
  })

  it('rejects an event type that is neither supported nor flagged official', async () => {
    mockReadEventType.mockResolvedValueOnce({ ...eventTypeRecord, eventType: 'MEJÄ', official: false })

    await expect(search({ ...lookupRequest, eventType: 'MEJÄ' })).rejects.toMatchObject({ status: 403 })
    expect(mockLueKokeet).not.toHaveBeenCalled()
  })

  it('looks up the Kennel Club counterpart of an SM event type', async () => {
    mockLueKokeet.mockResolvedValue({ json: [tamperePast], status: 200 })
    await search({ ...lookupRequest, eventType: 'NOME-B SM' })

    expect(mockRead).toHaveBeenCalledWith({ eventType: 'NOME-B' }, expect.anything())
    expect(mockLueKokeet).toHaveBeenCalledWith(expect.objectContaining({ koemuoto: 'NOME-B' }))
  })

  it('rejects requested organizer when user is not a member', async () => {
    const event = constructAPIGwEvent({ ...lookupRequest, organizer: { id: 'org-2' } }, { method: 'POST' })

    await expect(searchEventKcIdChoicesLambda(event)).rejects.toMatchObject({ status: 403 })
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockLueKokeet).not.toHaveBeenCalled()
  })

  it('refuses an organizer without a Kennel Club number', async () => {
    mockReadOrganizer.mockResolvedValueOnce({ id: 'org-id', name: 'Org' })

    await expect(search()).rejects.toMatchObject({ status: 400 })
    expect(mockLueKokeet).not.toHaveBeenCalled()
  })
})
