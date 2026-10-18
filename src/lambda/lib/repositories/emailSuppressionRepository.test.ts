import type { JsonEmailSuppression } from '../../../types'
import { vi } from 'vitest'

const mockRead = vi.fn()
const mockWrite = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { emailSuppressionTable: 'email-suppression-table' },
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

const { readEmailSuppression, writeEmailSuppression } = await import('./emailSuppressionRepository')

const suppression: JsonEmailSuppression = {
  email: 'owner@example.com',
  eventId: 'event-id',
  reason: 'smtp; 550 user unknown',
  registrationId: 'registration-id',
  status: 'bounce',
  updatedAt: '2026-05-27T10:00:00.000Z',
}

describe('emailSuppressionRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockWrite.mockReset()
  })

  it('opens its client on the email suppression table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('email-suppression-table')
    expect(mockConstructor).toHaveBeenCalledTimes(1)
  })

  it('readEmailSuppression reads the suppression by its address', async () => {
    mockRead.mockResolvedValueOnce(suppression)

    await expect(readEmailSuppression('owner@example.com')).resolves.toEqual(suppression)
    expect(mockRead).toHaveBeenCalledWith({ email: 'owner@example.com' })
  })

  it('readEmailSuppression returns undefined for an address the table does not hold', async () => {
    mockRead.mockResolvedValueOnce(undefined)

    await expect(readEmailSuppression('fine@example.com')).resolves.toBeUndefined()
  })

  it('writeEmailSuppression stores the suppression as given', async () => {
    mockWrite.mockResolvedValueOnce(undefined)

    await expect(writeEmailSuppression(suppression)).resolves.toBeUndefined()
    expect(mockWrite).toHaveBeenCalledWith(suppression)
  })

  it('passes a failed read on to the caller', async () => {
    mockRead.mockRejectedValueOnce(new Error('read failed'))

    await expect(readEmailSuppression('owner@example.com')).rejects.toThrow('read failed')
  })
})
