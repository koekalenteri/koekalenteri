import type { JsonEventType } from '../../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockWrite = vi.fn()
const mockBatchWrite = vi.fn()
const mockUpdate = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { eventTypeTable: 'event-type-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    write = (...args: unknown[]) => mockWrite(...args)
    batchWrite = (...args: unknown[]) => mockBatchWrite(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
  },
}))

const { readEventType, readEventTypes, updateEventTypeDescription, writeEventType, writeEventTypes } = await import(
  './eventTypeRepository'
)

const nomeB: JsonEventType = {
  active: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'system',
  description: { en: 'Retriever field trial B', fi: 'NOME-B', sv: 'NOME-B' },
  eventType: 'NOME-B',
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'system',
  official: true,
}

describe('eventTypeRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockWrite.mockReset()
    mockBatchWrite.mockReset()
    mockUpdate.mockReset()
  })

  it('opens its client on the event type table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('event-type-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readEventTypes reads the whole table', async () => {
    mockReadAll.mockResolvedValueOnce([nomeB])

    await expect(readEventTypes()).resolves.toEqual([nomeB])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readEventTypes returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readEventTypes()).resolves.toEqual([])
  })

  it('readEventType reads one event type by its code', async () => {
    mockRead.mockResolvedValueOnce(nomeB)

    await expect(readEventType('NOME-B')).resolves.toEqual(nomeB)
    expect(mockRead).toHaveBeenCalledWith({ eventType: 'NOME-B' })
  })

  it('readEventType returns undefined for a code the table does not know', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readEventType('NOPE')).resolves.toBeUndefined()
  })

  it('writeEventType stores the event type as given', async () => {
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(writeEventType(nomeB)).resolves.toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith(nomeB)
  })

  it('writeEventTypes stores the event types in one batch write', async () => {
    mockBatchWrite.mockResolvedValueOnce(undefined)

    await expect(writeEventTypes([nomeB])).resolves.toBeUndefined()
    expect(mockBatchWrite).toHaveBeenCalledWith([nomeB])
  })

  it('updateEventTypeDescription sets only the description and the modification stamp', async () => {
    mockUpdate.mockResolvedValueOnce({})
    const description = { en: 'B', fi: 'B-koe', sv: 'B-prov' }

    await expect(
      updateEventTypeDescription('NOME-B', {
        description,
        modifiedAt: '2024-02-01T00:00:00.000Z',
        modifiedBy: 'admin',
      })
    ).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenCalledWith(
      { eventType: 'NOME-B' },
      { set: { description, modifiedAt: '2024-02-01T00:00:00.000Z', modifiedBy: 'admin' } }
    )
  })
})
