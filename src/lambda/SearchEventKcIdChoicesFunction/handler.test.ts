import type { JsonUser, Organizer } from '../../types'
import type { KLKoetapahtuma } from '../types/KLAPI'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeWithMemberOf = jest.fn<() => Promise<{ memberOf: string[]; user: JsonUser }>>()
const mockRead = jest.fn<() => Promise<Organizer | undefined>>()
const mockResponse = jest.fn<(status: number, body: unknown, event: unknown) => unknown>()
const mockLueKoetapahtumat = jest.fn<() => Promise<{ error?: string; json?: KLKoetapahtuma[]; status: number }>>()

const TEST_NOW = new Date('2026-06-01T12:00:00.000Z')

class MockKLAPI {
  constructor() {
    // biome-ignore lint/correctness/noConstructorReturn: its a test
    return {
      lueKoetapahtumat: mockLueKoetapahtumat,
    }
  }
}

class MockLambdaError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

jest.unstable_mockModule('../lib/auth', () => ({
  authorizeWithMemberOf: mockAuthorizeWithMemberOf,
}))

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: MockKLAPI,
}))

jest.unstable_mockModule('../lib/lambda', () => ({
  LambdaError: MockLambdaError,
  lambda: jest.fn((_name, fn) => fn),
  response: mockResponse,
}))

jest.unstable_mockModule('../lib/secrets', () => ({
  getKLAPIConfig: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({
    read: mockRead,
  })),
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

const lookupRequest = {
  classes: [{ class: 'ALO', date: '2026-07-01T00:00:00.000Z' }],
  endDate: '2026-07-02T20:59:59.999Z',
  eventType: 'NOME-B',
  location: 'Espoo',
  name: 'Koe',
  organizer: { id: 'org-id', name: 'Org' },
  startDate: '2026-07-01T00:00:00.000Z',
}

const organizer: Organizer = {
  id: 'org-id',
  kcId: 12345,
  name: 'Org',
}

const otherOrganizer: Organizer = {
  id: 'org-2',
  kcId: 67890,
  name: 'Other Org',
}

describe('searchEventKcIdChoicesLambda', () => {
  beforeAll(() => {
    jest.useFakeTimers()
  })

  beforeEach(() => {
    jest.setSystemTime(TEST_NOW)
    jest.clearAllMocks()
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-id'], user })
    mockRead.mockResolvedValue(organizer)
    mockLueKoetapahtumat.mockResolvedValue({
      json: [
        {
          aika: '2026-07-01',
          id: 222,
          ilmoitauttumisLinkki: '',
          ilmoittautumisenAlku: '',
          ilmoittautumisenLoppu: '',
          ilmoittautumiset: '',
          kennelpiiri: '',
          koemuoto: 'Noutajien B-koe',
          koetoimitsija: '',
          lisatiedot: '',
          luokat: ['ALO'],
          lyhenne: 'NOME-B',
          osanottomaksu: '',
          paikka: 'Keskuspuisto',
          paikkakunta: 'Espoo',
          päättyy: '2026-07-02',
          rajoitukset: [],
          tapahtuma: 'Koe',
          tarkenne: '',
          tininumero: '',
          tyyppi: '',
          viitenumero: '',
          www: '',
          yhdistys: 'Org',
          ylituomari: '',
        },
      ],
      status: 200,
    })
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('uses organizer table kcId for Kennel Club search', async () => {
    const event = constructAPIGwEvent(lookupRequest, { method: 'POST' })

    await searchEventKcIdChoicesLambda(event)

    expect(mockRead).toHaveBeenCalledWith({ id: 'org-id' }, expect.anything())
    expect(mockLueKoetapahtumat).toHaveBeenCalledWith(
      expect.objectContaining({
        Koemuoto: 'NOME-B',
        Yhdistys: 12345,
      })
    )
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        choices: [
          {
            endDate: '2026-07-02',
            eventType: 'NOME-B',
            id: 222,
            location: 'Espoo, Keskuspuisto',
            name: 'Koe',
            organizer: 'Org',
            startDate: '2026-07-01',
          },
        ],
      },
      event
    )
  })

  it('requires selected organizer id', async () => {
    const event = constructAPIGwEvent({ ...lookupRequest, organizer: undefined }, { method: 'POST' })

    await expect(searchEventKcIdChoicesLambda(event)).rejects.toMatchObject({ status: 400 })
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockLueKoetapahtumat).not.toHaveBeenCalled()
  })

  it('uses requested organizer kcId', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValueOnce({ memberOf: ['org-id', 'org-2'], user })
    mockRead.mockResolvedValueOnce(otherOrganizer)
    const event = constructAPIGwEvent({ ...lookupRequest, organizer: { id: 'org-2' } }, { method: 'POST' })

    await searchEventKcIdChoicesLambda(event)

    expect(mockRead).toHaveBeenCalledWith({ id: 'org-2' }, expect.anything())
    expect(mockLueKoetapahtumat).toHaveBeenCalledWith(
      expect.objectContaining({
        Yhdistys: 67890,
      })
    )
  })

  it('expands the search date range when exact search returns no result from Kennel Club', async () => {
    mockLueKoetapahtumat
      .mockResolvedValueOnce({ error: '"Ei tulosta: /Koe/Lue/Koetapahtumat"', status: 404 })
      .mockResolvedValueOnce({
        json: [
          {
            aika: '2026-06-28T00:00:00',
            id: 453830,
            ilmoitauttumisLinkki: '',
            ilmoittautumisenAlku: '',
            ilmoittautumisenLoppu: '',
            ilmoittautumiset: '',
            kennelpiiri: '',
            koemuoto: 'Noutajien Working Test',
            koetoimitsija: '',
            lisatiedot: '',
            luokat: ['VOI'],
            lyhenne: 'NOWT',
            osanottomaksu: '',
            paikka: 'Korpilahti',
            paikkakunta: 'Jyväskylä',
            päättyy: '0001-01-01T00:00:00',
            rajoitukset: [],
            tapahtuma: '',
            tarkenne: '',
            tininumero: '',
            tyyppi: '',
            viitenumero: '',
            www: '',
            yhdistys: 'Org',
            ylituomari: '',
          },
        ],
        status: 200,
      })
    const event = constructAPIGwEvent(
      {
        ...lookupRequest,
        endDate: '2026-06-26T20:59:59.999Z',
        eventType: 'NOWT SM',
        startDate: '2026-06-26T00:00:00.000Z',
      },
      { method: 'POST' }
    )

    await searchEventKcIdChoicesLambda(event)

    expect(mockLueKoetapahtumat).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        Alku: '2026-06-26',
        Koemuoto: 'NOWT',
        Loppu: '2026-06-26',
      })
    )
    expect(mockLueKoetapahtumat).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        Alku: '2026-06-19',
        Koemuoto: 'NOWT',
        Loppu: '2026-07-03',
      })
    )
    expect(mockResponse).toHaveBeenCalledWith(
      200,
      expect.objectContaining({
        choices: [expect.objectContaining({ id: 453830 })],
      }),
      event
    )
  })

  it('returns empty choices when expanded search also returns no result from Kennel Club', async () => {
    mockLueKoetapahtumat
      .mockResolvedValueOnce({ error: '"Ei tulosta: /Koe/Lue/Koetapahtumat"', status: 404 })
      .mockResolvedValueOnce({ error: '"Ei tulosta: /Koe/Lue/Koetapahtumat"', status: 404 })
    const event = constructAPIGwEvent(
      {
        ...lookupRequest,
        endDate: '2026-06-26T20:59:59.999Z',
        eventType: 'NOWT',
        startDate: '2026-06-26T00:00:00.000Z',
      },
      { method: 'POST' }
    )

    await searchEventKcIdChoicesLambda(event)

    expect(mockLueKoetapahtumat).toHaveBeenCalledTimes(2)
    expect(mockResponse).toHaveBeenCalledWith(200, { choices: [] }, event)
  })

  it('maps compatible fields from Kennel Club event payload', async () => {
    mockLueKoetapahtumat.mockResolvedValueOnce({
      json: [
        {
          aika: '2026-06-28T00:00:00',
          id: 453830,
          ilmoitauttumisLinkki: 'https://koekalenteri.snj.fi/',
          ilmoittautuminenAlkaa: '2026-05-17T00:00:00',
          ilmoittautuminenPäättyy: '2026-06-07T00:00:00',
          ilmoittautumiset: '',
          ilmoittautumiset_Nimi: '',
          ilmoittautumiset_Puhelin: '358400512651',
          ilmoittautumiset_Sähköposti: 'nome.maija@gmail.com',
          kennelpiiri: 'Keski-Suomen kennelpiiri ry.',
          kilpailunjohtaja: '',
          koemuoto: 'Noutajien Working Test',
          koetoimitsija: 'Parviainen Niina',
          lisätiedot: 'Osallistumismaksu sisältää keittolounaan.',
          luokat: [{ id_Tapahtuma: 443282, luokka: 'VOI' }],
          lyhenne: 'NOWT',
          muutLisätiedot: '',
          osallistumismaksu: 55,
          paikka: 'Korpilahti',
          paikkakunta: 'Jyväskylä',
          päättyy: '0001-01-01T00:00:00',
          rajoitukset: [{ lisätiedot: 'SM järjestämisohje', rajoituksenTyyppi: 'Muu määrää koskeva rajoitus' }],
          tapahtuma: '',
          tarkenne: '',
          tilinumero: 'FI86 1281 3000 2014 69',
          tyyppi: 'SM-koe tai muu mestaruusottelu',
          viitenumero: '1012',
          www: '',
          yhdistys: 'KESKI-SUOMEN NOUTAJAKOIRAYHDISTYS RY.',
          ylituomari: 'Fontell Ari-Pekka',
        },
      ],
      status: 200,
    })
    const event = constructAPIGwEvent({ ...lookupRequest, eventType: 'NOWT' }, { method: 'POST' })

    await searchEventKcIdChoicesLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(
      200,
      {
        choices: [
          expect.objectContaining({
            contactInfo: {
              secretary: {
                email: 'nome.maija@gmail.com',
                phone: '358400512651',
              },
            },
            cost: 55,
            description: 'Osallistumismaksu sisältää keittolounaan.\n\nMuu määrää koskeva rajoitus: SM järjestämisohje',
            endDate: '0001-01-01T00:00:00',
            entryEndDate: '2026-06-07T00:00:00',
            entryStartDate: '2026-05-17T00:00:00',
            eventType: 'NOWT SM',
            id: 453830,
            location: 'Jyväskylä, Korpilahti',
            name: '',
            organizer: 'KESKI-SUOMEN NOUTAJAKOIRAYHDISTYS RY.',
            startDate: '2026-06-28T00:00:00',
          }),
        ],
      },
      event
    )
  })

  it('rejects requested organizer when user is not a member', async () => {
    const event = constructAPIGwEvent({ ...lookupRequest, organizer: { id: 'org-2' } }, { method: 'POST' })

    await expect(searchEventKcIdChoicesLambda(event)).rejects.toMatchObject({ status: 403 })
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockLueKoetapahtumat).not.toHaveBeenCalled()
  })
})
