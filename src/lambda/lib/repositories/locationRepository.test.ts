import type { LocationSnapshot } from './locationRepository'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { locationTable: 'location-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const { readLocationSnapshot, writeLocationSnapshot } = await import('./locationRepository')

const items = [{ district: 'Helsinki', id: 1, name: 'Helsinki' }]
const snapshot: LocationSnapshot = { count: 1, id: 'fi', items, modifiedAt: '2024-01-01T00:00:00.000Z' }

describe('locationRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockWrite.mockReset()
  })

  it('opens its client on the location table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('location-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readLocationSnapshot reads the single snapshot row', async () => {
    mockRead.mockResolvedValueOnce(snapshot)

    await expect(readLocationSnapshot()).resolves.toEqual(snapshot)
    expect(mockRead).toHaveBeenCalledWith({ id: 'fi' })
  })

  it('readLocationSnapshot returns undefined before the first sync', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readLocationSnapshot()).resolves.toBeUndefined()
  })

  it('writeLocationSnapshot writes the snapshot under the single row key', async () => {
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(
      writeLocationSnapshot({ count: 1, items, modifiedAt: '2024-01-01T00:00:00.000Z' })
    ).resolves.toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith(snapshot)
  })
})
