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

const { createOfficialDirectoryLambda, syncOfficialDirectory } = await import('./officialDirectory')
const { collectionChangesSince } = await import('./incremental')

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

  it('reports the entries deleted since the requested time as deletedIds', async () => {
    mockAuthorize.mockResolvedValueOnce(user)

    const res = await directoryLambda(
      constructAPIGwEvent({}, { query: { since: String(Date.parse('2024-01-01T12:00:00.000Z')) } })
    )

    expect(res.statusCode).toEqual(200)
    expect(JSON.parse(res.body)).toEqual({
      cursor: Date.parse('2024-01-02T00:00:00.000Z'),
      deletedIds: ['456'],
      items: [],
    })
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

describe('syncOfficialDirectory', () => {
  const now = '2024-05-30T20:00:00.000Z'
  const returning: JsonJudge = {
    ...stored,
    deletedAt: '2024-03-01T00:00:00.000Z',
    deletedBy: 'system',
    languages: ['fi'],
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const sync = async (rows: JsonJudge[], incoming: PartialJsonJudge[]) => {
    const written: JsonJudge[] = []
    await syncOfficialDirectory(incoming, {
      create: (entry, at): JsonJudge => ({
        active: true,
        createdAt: at,
        createdBy: 'system',
        languages: [],
        modifiedAt: at,
        modifiedBy: 'system',
        ...entry,
      }),
      label: 'judge',
      partialize: ({ district, email, eventTypes, id, location, name, official, phone }) => ({
        district,
        email,
        eventTypes,
        id,
        location,
        name,
        official,
        phone,
      }),
      readAll: async () => rows,
      writeAll: async (entries) => {
        written.push(...entries)
      },
    })
    return written
  }

  it('restores a deleted entry that is back on the list, in place, once', async () => {
    const row = structuredClone(returning)

    const written = await sync([row], [entry])

    expect(written).toHaveLength(1)
    expect(written[0]).toBe(row)
    expect(written[0]).toEqual({ ...stored, languages: ['fi'], modifiedAt: now, modifiedBy: 'system' })
    expect(written[0].deletedAt).toBeUndefined()
    expect(written[0].deletedBy).toBeUndefined()
  })

  it('gives the restored entry a stamp that brings it back to a client that saw the deletion', async () => {
    const written = await sync([structuredClone(returning)], [entry])

    expect(Date.parse(written[0].modifiedAt)).toBeGreaterThan(Date.parse('2024-03-01T00:00:00.000Z'))
    expect(collectionChangesSince(written, new Date('2024-03-01T00:00:00.000Z'))).toEqual({
      cursor: Date.parse(now),
      deletedIds: [],
      items: written,
    })
  })

  it('writes nothing for a live entry whose Kennel Club fields did not change', async () => {
    await expect(sync([structuredClone(stored)], [entry])).resolves.toEqual([])
  })

  it('leaves an entry deleted earlier alone while it stays off the list', async () => {
    const written = await sync([structuredClone(returning)], [{ ...entry, id: 789 }])

    expect(written).toEqual([expect.objectContaining({ id: 789 })])
  })
})
