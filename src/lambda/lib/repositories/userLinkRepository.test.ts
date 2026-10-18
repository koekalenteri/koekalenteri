import { vi } from 'vitest'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { userLinkTable: 'user-link-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const { readAllUserLinks, readUserLink, writeUserLink } = await import('./userLinkRepository')

const link = { cognitoUser: 'cognito-1', userId: 'user-1' }

describe('userLinkRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockWrite.mockReset()
  })

  it('opens its client on the user link table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('user-link-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readUserLink reads the link by the Cognito identity', async () => {
    mockRead.mockResolvedValueOnce(link)

    await expect(readUserLink('cognito-1')).resolves.toEqual(link)
    expect(mockRead).toHaveBeenCalledWith({ cognitoUser: 'cognito-1' })
  })

  it('readUserLink answers undefined for an identity without a link', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readUserLink('cognito-2')).resolves.toBeUndefined()
  })

  it('writeUserLink puts the link as given', async () => {
    await writeUserLink(link)

    expect(mockWrite).toHaveBeenCalledWith(link)
  })

  it('readAllUserLinks scans the whole table', async () => {
    mockReadAll.mockResolvedValueOnce([link])

    await expect(readAllUserLinks()).resolves.toEqual([link])
    expect(mockReadAll).toHaveBeenCalledWith()
  })

  it('readAllUserLinks answers an empty list when the scan returns nothing', async () => {
    mockReadAll.mockResolvedValueOnce(undefined)

    await expect(readAllUserLinks()).resolves.toEqual([])
  })
})
