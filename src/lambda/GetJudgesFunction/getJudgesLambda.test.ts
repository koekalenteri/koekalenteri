import type { JsonJudge, JsonUser } from '../../types'
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

const mockReadAll = vi.fn<() => Promise<Partial<JsonJudge>[]>>()
const mockWriteAll = vi.fn<(items: JsonJudge[]) => Promise<void>>()
vi.doMock('../lib/repositories/judgeRepository', () => ({
  readJudges: mockReadAll,
  writeJudges: mockWriteAll,
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

const { default: getJudgesHandler } = await import('./handler')

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

describe('getJudgesLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await getJudgesHandler(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 401 with refresh if user is not admin', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await getJudgesHandler(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(res.statusCode).toEqual(401)
  })

  it('refreshes the judges from the Kennel Club and syncs them as judge users', async () => {
    authorizeMock.mockResolvedValueOnce({ ...mockUser, admin: true })
    mockReadEventTypes.mockResolvedValueOnce([{ active: true, eventType: 'NOME-B', official: true }])
    mockKLAPI.lueKoemuodonYlituomarit.mockResolvedValueOnce({
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

    const res = await getJudgesHandler(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    const entry = expect.objectContaining({
      email: 'testi@example.com',
      eventTypes: ['NOME-B'],
      id: 7,
      official: true,
    })
    expect(res.statusCode).toEqual(200)
    expect(mockKLAPI.lueKoemuodonYlituomarit).toHaveBeenCalledWith({ Kieli: 1, Koemuoto: 'NOME-B' })
    expect(mockKLAPI.lueKoemuodonKoetoimitsijat).not.toHaveBeenCalled()
    expect(mockWriteAll).toHaveBeenCalledWith([entry])
    expect(mockUpdateUsers).toHaveBeenCalledWith([entry], 'judge')
    expect(mockPublishAdminDataInvalidation).toHaveBeenCalledWith(['judges', 'users'])
  })

  it('should return all non-deleted officials', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockReadAll.mockResolvedValue([{ deletedAt: 'sometimes' }, { name: 'not deleted' }])

    const res = await getJudgesHandler(constructAPIGwEvent({}))
    expect(res.statusCode).toEqual(200)
    expect(res.body).toMatchInlineSnapshot('"[{"name":"not deleted"}]"')
  })

  it('returns changed judges and deletion tombstones since the requested time', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockReadAll.mockResolvedValue([
      { id: 1, modifiedAt: '2024-01-01T00:00:00.000Z', name: 'unchanged' },
      { id: 2, modifiedAt: '2024-01-03T00:00:00.000Z', name: 'changed' },
      { deletedAt: '2024-01-04T00:00:00.000Z', id: 3, modifiedAt: '2024-01-01T00:00:00.000Z' },
    ])

    const res = await getJudgesHandler(
      constructAPIGwEvent({}, { query: { since: String(new Date('2024-01-02T00:00:00.000Z').getTime()) } })
    )

    expect(JSON.parse(res.body)).toEqual({
      cursor: Date.parse('2024-01-04T00:00:00.000Z'),
      deletedIds: ['3'],
      items: [{ id: 2, modifiedAt: '2024-01-03T00:00:00.000Z', name: 'changed' }],
    })
  })
})
