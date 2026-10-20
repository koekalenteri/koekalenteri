import type { Organizer } from '../../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockWrite = vi.fn()
const mockUpdate = vi.fn()
const mockBatchWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { organizerTable: 'organizer-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    write = (...args: unknown[]) => mockWrite(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
    batchWrite = (...args: unknown[]) => mockBatchWrite(...args)
  },
}))

const { addOrganizers, readOrganizer, readOrganizers, readOrganizersIncludingDeleted, renameOrganizer, saveOrganizer } =
  await import('./organizerRepository')

const organizer: Organizer = { id: 'org1', kcId: 400294, name: 'Seura', paytrailMerchantId: 'm-1' }

describe('organizerRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockWrite.mockReset()
    mockUpdate.mockReset()
    mockBatchWrite.mockReset()
  })

  it('opens its client on the organizer table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('organizer-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readOrganizers returns every organizer the table holds', async () => {
    mockReadAll.mockResolvedValueOnce([organizer])

    await expect(readOrganizers()).resolves.toEqual([organizer])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readOrganizers returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readOrganizers()).resolves.toEqual([])
  })

  it('readOrganizersIncludingDeleted returns the soft-deleted rows too', async () => {
    const deleted = { ...organizer, deletedAt: '2025-01-01T00:00:00.000Z', id: 'org-deleted' }
    mockReadAll.mockResolvedValueOnce([organizer, deleted])

    await expect(readOrganizersIncludingDeleted()).resolves.toEqual([organizer, deleted])
    expect(mockReadAll).toHaveBeenCalledWith({ includeDeleted: true })
  })

  it('readOrganizersIncludingDeleted returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readOrganizersIncludingDeleted()).resolves.toEqual([])
  })

  it('readOrganizer reads the organizer by its id', async () => {
    mockRead.mockResolvedValueOnce(organizer)

    await expect(readOrganizer('org1')).resolves.toEqual(organizer)
    expect(mockRead).toHaveBeenCalledWith({ id: 'org1' })
  })

  it('readOrganizer returns undefined for an organizer the table does not hold', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readOrganizer('missing')).resolves.toBeUndefined()
  })

  it('saveOrganizer writes the changes over the stored row and returns it', async () => {
    mockRead.mockResolvedValueOnce(organizer)
    mockWrite.mockResolvedValueOnce(undefined)

    const expected = { ...organizer, paytrailMerchantId: 'm-2' }
    await expect(saveOrganizer({ id: 'org1', paytrailMerchantId: 'm-2' })).resolves.toEqual(expected)
    expect(mockRead).toHaveBeenCalledWith({ id: 'org1' })
    expect(mockWrite).toHaveBeenCalledWith(expected)
  })

  it('saveOrganizer stores the changes as given for an organizer the table does not hold', async () => {
    mockRead.mockResolvedValueOnce(undefined)
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(saveOrganizer({ id: 'org2', name: 'Uusi' })).resolves.toEqual({ id: 'org2', name: 'Uusi' })
    expect(mockWrite).toHaveBeenCalledWith({ id: 'org2', name: 'Uusi' })
  })

  it('saveOrganizer writes nothing when the read fails', async () => {
    mockRead.mockRejectedValueOnce(new Error('read failed'))

    await expect(saveOrganizer({ id: 'org1', name: 'Seura' })).rejects.toThrow('read failed')
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('renameOrganizer sets the name of the organizer by its id', async () => {
    mockUpdate.mockResolvedValueOnce(undefined)

    await expect(renameOrganizer('org1', 'Uusi nimi')).resolves.toBeUndefined()
    expect(mockUpdate).toHaveBeenCalledWith({ id: 'org1' }, { set: { name: 'Uusi nimi' } })
  })

  it('addOrganizers writes the organizers as given', async () => {
    mockBatchWrite.mockResolvedValueOnce(undefined)

    await expect(addOrganizers([organizer])).resolves.toBeUndefined()
    expect(mockBatchWrite).toHaveBeenCalledWith([organizer])
  })
})
