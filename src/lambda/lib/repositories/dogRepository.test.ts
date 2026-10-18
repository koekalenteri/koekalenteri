import type { JsonDog } from '../../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockWrite = vi.fn()
const mockDelete = vi.fn()
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
  },
}))

const { deleteDog, readDog, readOfficialResults, writeDog } = await import('./dogRepository')

const result = {
  class: 'ALO',
  date: '2024-01-01',
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
})
