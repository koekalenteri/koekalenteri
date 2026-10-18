import type { JsonOfficial } from '../../../types'
import { vi } from 'vitest'

const mockReadAll = vi.fn()
const mockBatchWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { officialTable: 'official-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    readAll = (...args: unknown[]) => mockReadAll(...args)
    batchWrite = (...args: unknown[]) => mockBatchWrite(...args)
  },
}))

const { readOfficials, readOfficialsIncludingDeleted, writeOfficials } = await import('./officialRepository')

const official: JsonOfficial = {
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'system',
  district: 'Helsinki',
  email: 'official@example.com',
  eventTypes: ['NOME-B'],
  id: 456,
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'system',
  name: 'Official Person',
}

describe('officialRepository', () => {
  beforeEach(() => {
    mockReadAll.mockReset()
    mockBatchWrite.mockReset()
  })

  it('opens its client on the official table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('official-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readOfficials reads the whole table without the deleted rows', async () => {
    mockReadAll.mockResolvedValueOnce([official])

    await expect(readOfficials()).resolves.toEqual([official])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readOfficialsIncludingDeleted reads the whole table with the deleted rows', async () => {
    const deleted = { ...official, deletedAt: '2024-01-02T00:00:00.000Z', deletedBy: 'system' }
    mockReadAll.mockResolvedValueOnce([official, deleted])

    await expect(readOfficialsIncludingDeleted()).resolves.toEqual([official, deleted])
    expect(mockReadAll).toHaveBeenCalledWith({ includeDeleted: true })
  })

  it('readOfficialsIncludingDeleted returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readOfficialsIncludingDeleted()).resolves.toEqual([])
  })

  it('readOfficials returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readOfficials()).resolves.toEqual([])
  })

  it('writeOfficials stores the officials in one batch write', async () => {
    mockBatchWrite.mockResolvedValueOnce(undefined)

    await expect(writeOfficials([official])).resolves.toBeUndefined()
    expect(mockBatchWrite).toHaveBeenCalledWith([official])
  })
})
