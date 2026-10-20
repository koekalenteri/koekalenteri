import type { JsonDog, JsonTestResult } from '../../../types'
import { vi } from 'vitest'
import { legacyDayValue } from '../../../test-utils/finnishDays'

const mockRead = vi.fn()
const mockWrite = vi.fn()
const mockDelete = vi.fn()
const mockReadAll = vi.fn()
const mockUpdate = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { dogTable: 'dog-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    write = (...args: unknown[]) => mockWrite(...args)
    delete = (...args: unknown[]) => mockDelete(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
  },
}))

const { deleteDog, readAllDogs, readDog, readOfficialResults, writeDog, writeMigratedDog } = await import(
  './dogRepository'
)

const result: JsonTestResult = {
  class: 'ALO',
  date: '2024-01-01' as const,
  judge: 'Judge',
  location: 'Helsinki',
  result: 'ALO1',
  type: 'NOU',
}
const dog: JsonDog = { name: 'Koera', regNo: 'FI12345/24', results: [result] }

describe('dogRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockWrite.mockReset()
    mockDelete.mockReset()
  })

  it('opens its client on the dog table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('dog-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readDog reads the dog by its registration number', async () => {
    mockRead.mockResolvedValueOnce(dog)

    await expect(readDog('FI12345/24')).resolves.toEqual(dog)
    expect(mockRead).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
  })

  it('readDog returns undefined for a dog the table does not hold', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readDog('FI99999/24')).resolves.toBeUndefined()
  })

  it('writeDog stores the dog as given', async () => {
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(writeDog(dog)).resolves.toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith(dog)
  })

  it('deleteDog deletes the dog by its registration number', async () => {
    mockDelete.mockResolvedValueOnce(true)

    await expect(deleteDog('FI12345/24')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
  })

  it.each([
    ['a dog the table does not hold', undefined],
    ['a dog stored without results', { regNo: 'FI12345/24' }],
  ])('readOfficialResults returns no results for %s', async (_label, stored) => {
    mockRead.mockResolvedValueOnce(stored)

    await expect(readOfficialResults('FI12345/24')).resolves.toEqual([])
  })

  it('readOfficialResults returns the results the table holds for the dog', async () => {
    mockRead.mockResolvedValueOnce(dog)

    await expect(readOfficialResults('FI12345/24')).resolves.toEqual([result])
    expect(mockRead).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
  })

  it('passes a failed read on to the caller', async () => {
    mockRead.mockRejectedValueOnce(new Error('read failed'))

    await expect(readOfficialResults('FI12345/24')).rejects.toThrow('read failed')
  })

  it('readAllDogs scans the whole table and answers an empty list for nothing', async () => {
    mockReadAll.mockResolvedValueOnce([dog]).mockResolvedValueOnce(undefined)

    await expect(readAllDogs()).resolves.toEqual([dog])
    await expect(readAllDogs()).resolves.toEqual([])
    expect(mockReadAll).toHaveBeenCalledWith({ includeDeleted: true })
  })

  // A dog row has no updatedAt: the condition is that the dates it changes still hold what was read.
  it('writeMigratedDog writes on condition the row and the dates it read are still there', async () => {
    const changes = { set: { dob: '2021-01-01' as const } }

    await writeMigratedDog(
      { dob: legacyDayValue('2021-01-01T00:00:00'), regNo: 'FI12345/24', results: [result] },
      changes
    )

    expect(mockUpdate).toHaveBeenCalledWith({ regNo: 'FI12345/24' }, changes, undefined, {
      expression: 'attribute_exists(#regNo) AND #dob = :readDob AND #results = :readResults',
      names: { '#dob': 'dob', '#regNo': 'regNo', '#results': 'results' },
      values: { ':readDob': '2021-01-01T00:00:00', ':readResults': [result] },
    })
  })

  it('writeMigratedDog holds a field read as absent to still being absent', async () => {
    const changes = { set: { 'results.0.date': '2024-01-01' } }

    await writeMigratedDog({ regNo: 'FI12345/24' }, changes)

    expect(mockUpdate).toHaveBeenCalledWith({ regNo: 'FI12345/24' }, changes, undefined, {
      expression: 'attribute_exists(#regNo) AND attribute_not_exists(#dob) AND attribute_not_exists(#results)',
      names: { '#dob': 'dob', '#regNo': 'regNo', '#results': 'results' },
    })
  })
})
