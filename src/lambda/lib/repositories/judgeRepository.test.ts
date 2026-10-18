import type { JsonJudge } from '../../../types'
import { vi } from 'vitest'

const mockReadAll = vi.fn()
const mockWrite = vi.fn()
const mockBatchWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { judgeTable: 'judge-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    readAll = (...args: unknown[]) => mockReadAll(...args)
    write = (...args: unknown[]) => mockWrite(...args)
    batchWrite = (...args: unknown[]) => mockBatchWrite(...args)
  },
}))

const { readJudges, readJudgesIncludingDeleted, writeJudge, writeJudges } = await import('./judgeRepository')

const judge: JsonJudge = {
  active: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  createdBy: 'system',
  district: 'Helsinki',
  email: 'judge@example.com',
  eventTypes: ['NOME-B'],
  id: 123,
  languages: ['fi'],
  modifiedAt: '2024-01-01T00:00:00.000Z',
  modifiedBy: 'system',
  name: 'Judge Person',
  official: true,
}

describe('judgeRepository', () => {
  beforeEach(() => {
    mockReadAll.mockReset()
    mockWrite.mockReset()
    mockBatchWrite.mockReset()
  })

  it('opens its client on the judge table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('judge-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readJudges reads the whole table without the deleted rows', async () => {
    mockReadAll.mockResolvedValueOnce([judge])

    await expect(readJudges()).resolves.toEqual([judge])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readJudgesIncludingDeleted reads the whole table with the deleted rows', async () => {
    const deleted = { ...judge, deletedAt: '2024-01-02T00:00:00.000Z', deletedBy: 'system' }
    mockReadAll.mockResolvedValueOnce([judge, deleted])

    await expect(readJudgesIncludingDeleted()).resolves.toEqual([judge, deleted])
    expect(mockReadAll).toHaveBeenCalledWith({ includeDeleted: true })
  })

  it('readJudgesIncludingDeleted returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readJudgesIncludingDeleted()).resolves.toEqual([])
  })

  it('readJudges returns an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readJudges()).resolves.toEqual([])
  })

  it('writeJudge stores the judge as given', async () => {
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(writeJudge(judge)).resolves.toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith(judge)
  })

  it('writeJudges stores the judges in one batch write', async () => {
    mockBatchWrite.mockResolvedValueOnce(undefined)

    await expect(writeJudges([judge])).resolves.toBeUndefined()
    expect(mockBatchWrite).toHaveBeenCalledWith([judge])
  })
})
