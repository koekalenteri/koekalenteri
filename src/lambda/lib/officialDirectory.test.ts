import type { JsonEventType, JsonJudge, JsonUser } from '../../types'
import type { PartialJsonJudge } from './judge'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import KLAPI from './KLAPI'

const mockAuthorize = vi.fn<(event: unknown) => Promise<JsonUser | null>>()
vi.doMock('./auth', () => ({
  authorize: mockAuthorize,
}))

const mockReadEventTypes = vi.fn<() => Promise<Partial<JsonEventType>[]>>()
vi.doMock('./repositories/eventTypeRepository', () => ({
  readEventTypes: mockReadEventTypes,
}))

const mockUpdateUsers = vi.fn<(items: PartialJsonJudge[], role: 'judge' | 'officer') => Promise<void>>()
vi.doMock('./user', () => ({
  updateUsersFromOfficialsOrJudges: mockUpdateUsers,
}))

const { createOfficialDirectoryLambda } = await import('./officialDirectory')

const user: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: 'user-1',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}
const admin: JsonUser = { ...user, admin: true }

const entry: PartialJsonJudge = {
  district: 'Helsinki',
  email: 'judge@example.com',
  eventTypes: ['NOME-B'],
  id: 123,
  name: 'Judge Person',
  official: true,
}
const stored: JsonJudge = {
  ...entry,
  active: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'system',
  languages: [],
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'system',
}
const deleted: JsonJudge = { ...stored, deletedAt: '2024-01-02T00:00:00.000Z', id: 456 }

// Never asked for its config: the fetch below is a test double.
const klapi = new KLAPI(() => Promise.reject(new Error('not used')))
const fetch = vi.fn<(klapi: KLAPI, eventTypes: string[]) => Promise<PartialJsonJudge[] | undefined>>()
const update = vi.fn<(entries: PartialJsonJudge[]) => Promise<void>>()
const readAll = vi.fn<() => Promise<JsonJudge[]>>()
const onRefreshed = vi.fn<(collections: string[]) => Promise<unknown>>()

const directoryLambda = createOfficialDirectoryLambda({
  collection: 'judges',
  fetch,
  klapi: () => klapi,
  onRefreshed,
  readAll,
  role: 'judge',
  service: 'getJudges',
  update,
})

const refresh = () => directoryLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

describe('createOfficialDirectoryLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    readAll.mockResolvedValue([stored, deleted])
    mockReadEventTypes.mockResolvedValue([
      { active: true, eventType: 'NOME-B', official: true },
      { active: false, eventType: 'NOME-A', official: true },
      { active: true, eventType: 'TEST', official: false },
    ])
  })

  it('refuses a caller who is not signed in', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const res = await directoryLambda(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
    expect(readAll).not.toHaveBeenCalled()
  })

  it('refuses a refresh from someone who is not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce(user)

    const res = await refresh()

    expect(res.statusCode).toEqual(401)
    expect(mockReadEventTypes).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns the stored directory without the deleted entries when not refreshing', async () => {
    mockAuthorize.mockResolvedValueOnce(user)

    const res = await directoryLambda(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).toEqual([stored])
    expect(mockReadEventTypes).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refreshes from the active official event types, then syncs the directory and its users', async () => {
    mockAuthorize.mockResolvedValueOnce(admin)
    fetch.mockResolvedValueOnce([entry])

    const res = await refresh()

    expect(fetch).toHaveBeenCalledWith(klapi, ['NOME-B'])
    expect(update).toHaveBeenCalledWith([entry])
    expect(mockUpdateUsers).toHaveBeenCalledWith([entry], 'judge')
    expect(onRefreshed).toHaveBeenCalledWith(['judges', 'users'])
    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).toEqual([stored])
  })

  it('leaves the directory and the users alone when the Kennel Club returns nothing', async () => {
    mockAuthorize.mockResolvedValueOnce(admin)
    fetch.mockResolvedValueOnce(undefined)

    const res = await refresh()

    expect(update).not.toHaveBeenCalled()
    expect(mockUpdateUsers).not.toHaveBeenCalled()
    expect(onRefreshed).toHaveBeenCalledWith(['judges', 'users'])
    expect(res.statusCode).toEqual(200)
  })
})
