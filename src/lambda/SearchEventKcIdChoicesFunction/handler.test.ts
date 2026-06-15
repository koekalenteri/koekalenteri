import type { JsonUser, Organizer } from '../../types'
import type { KLKoetapahtuma } from '../types/KLAPI'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.useFakeTimers()
jest.setSystemTime(new Date('2026-06-30T12:00:00.000Z'))

const mockAuthorizeWithMemberOf = jest.fn<() => Promise<{ memberOf: string[]; user: JsonUser }>>()
const mockRead = jest.fn<() => Promise<Organizer | undefined>>()
const mockResponse = jest.fn<(status: number, body: unknown, event: unknown) => unknown>()
const mockLueKoetapahtumat = jest.fn<() => Promise<{ error?: string; json?: KLKoetapahtuma[]; status: number }>>()

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
  beforeEach(() => {
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

  it('rejects requested organizer when user is not a member', async () => {
    const event = constructAPIGwEvent({ ...lookupRequest, organizer: { id: 'org-2' } }, { method: 'POST' })

    await expect(searchEventKcIdChoicesLambda(event)).rejects.toMatchObject({ status: 403 })
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockLueKoetapahtumat).not.toHaveBeenCalled()
  })
})
