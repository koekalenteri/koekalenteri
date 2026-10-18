import type { JsonOfficial, JsonUser } from '../../types'
import { vi } from 'vitest'

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

import { constructAPIGwEvent } from '../test-utils/helpers'

const mockKLAPI = {
  lueKoemuodonKoetoimitsijat: vi.fn(),
  lueKoemuodonYlituomarit: vi.fn(),
}
vi.doMock('../lib/KLAPI', () => ({
  default: vi.fn(function MockKLAPI() {
    return mockKLAPI
  }),
}))

vi.doMock('../lib/api-gw', () => ({
  getOrigin: vi.fn(),
}))

vi.doMock('../lib/auth', () => ({
  authorize: vi.fn(),
  getAndUpdateUserByEmail: vi.fn(),
}))

// The rows the table holds, deleted ones included. The two readers see them the way the real
// client does: the live reader without the deleted rows, the other with them (KOE-1569).
const mockReadAll = vi.fn<() => Promise<Partial<JsonOfficial>[]>>()
const readLive = async () => (await mockReadAll()).filter((row) => !row.deletedAt)
const mockWriteAll = vi.fn<(items: JsonOfficial[]) => Promise<void>>()
vi.doMock('../lib/repositories/officialRepository', () => ({
  readOfficials: readLive,
  readOfficialsIncludingDeleted: mockReadAll,
  writeOfficials: mockWriteAll,
}))

const mockReadEventTypes = vi.fn()
vi.doMock('../lib/repositories/eventTypeRepository', () => ({
  readEventTypes: mockReadEventTypes,
}))

const mockUpdateUsers = vi.fn()
vi.doMock('../lib/user', () => ({
  updateUsersFromOfficialsOrJudges: mockUpdateUsers,
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as import('vitest').Mock<typeof authorize>

const { default: getOfficialsLambda } = await import('./handler')

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

describe('getOfficialsLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await getOfficialsLambda(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 401 with refresh if user is not admin', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await getOfficialsLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(res.statusCode).toEqual(401)
  })

  it('refreshes the officials from the Kennel Club and syncs them as officer users', async () => {
    authorizeMock.mockResolvedValueOnce({ ...mockUser, admin: true })
    mockReadEventTypes.mockResolvedValueOnce([{ active: true, eventType: 'NOME-B', official: true }])
    mockKLAPI.lueKoemuodonKoetoimitsijat.mockResolvedValueOnce({
      json: [
        {
          jäsennumero: 7,
          kennelpiiri: 'Helsinki',
          koemuodot: [{ koemuoto: 'NOME-B', lyhenne: 'NOME-B' }],
          nimi: 'henkilö testi',
          paikkakunta: 'espoo',
          puhelin: '040',
          sähköposti: 'Testi@Example.com',
        },
      ],
      status: 200,
    })
    mockReadAll.mockResolvedValue([])

    const res = await getOfficialsLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    const entry = expect.objectContaining({
      email: 'testi@example.com',
      eventTypes: ['NOME-B'],
      id: 7,
    })
    expect(res.statusCode).toEqual(200)
    expect(mockKLAPI.lueKoemuodonKoetoimitsijat).toHaveBeenCalledWith({ Kieli: 1, Koemuoto: 'NOME-B' })
    expect(mockKLAPI.lueKoemuodonYlituomarit).not.toHaveBeenCalled()
    expect(mockWriteAll).toHaveBeenCalledWith([entry])
    expect(mockUpdateUsers).toHaveBeenCalledWith([entry], 'officer')
    expect(mockPublishAdminDataInvalidation).toHaveBeenCalledWith(['officials', 'users'])
  })

  it('should return all non-deleted officials', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockReadAll.mockResolvedValue([{ deletedAt: 'sometimes' }, { name: 'not deleted' }])

    const res = await getOfficialsLambda(constructAPIGwEvent({}))
    expect(res.statusCode).toEqual(200)
    expect(res.body).toMatchInlineSnapshot('"[{"name":"not deleted"}]"')
  })

  it('returns changed officials and deletion tombstones since the requested time', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockReadAll.mockResolvedValue([
      { id: 1, modifiedAt: '2024-01-01T00:00:00.000Z', name: 'unchanged' },
      { id: 2, modifiedAt: '2024-01-03T00:00:00.000Z', name: 'changed' },
      { deletedAt: '2024-01-04T00:00:00.000Z', id: 3, modifiedAt: '2024-01-01T00:00:00.000Z' },
    ])

    const res = await getOfficialsLambda(
      constructAPIGwEvent({}, { query: { since: String(new Date('2024-01-02T00:00:00.000Z').getTime()) } })
    )

    expect(JSON.parse(res.body)).toEqual({
      cursor: Date.parse('2024-01-04T00:00:00.000Z'),
      deletedIds: ['3'],
      items: [{ id: 2, modifiedAt: '2024-01-03T00:00:00.000Z', name: 'changed' }],
    })
  })
})
