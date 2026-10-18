import { vi } from 'vitest'
import { loggedLines } from '../../test-utils/logs'

const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockUpdate = vi.fn()
const mockDocumentTransaction = vi.fn()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { registrationTable: 'registration-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    documentTransaction = (...args: unknown[]) => mockDocumentTransaction(...args)
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
  },
}))

const {
  claimTransactionCreation,
  dropOpenTransactionId,
  markDuplicatePayment,
  readRegistrationConsistently,
  readRegistrationsForStats,
  registrationUpdateItem,
  releaseTransactionCreation,
} = await import('./registrationRepository')

const namedError = (name: string) => {
  const error = new Error(name)
  error.name = name
  return error
}

describe('registrationRepository', () => {
  beforeEach(() => {
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockUpdate.mockReset()
    mockDocumentTransaction.mockReset()
  })

  it('opens its client on the registration table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('registration-table')
  })

  describe('readRegistrationsForStats', () => {
    it('reads every registration with only the fields the stats count from', async () => {
      const rows = [{ eventId: 'e1', id: 'r1' }]
      mockReadAll.mockResolvedValueOnce(rows)

      await expect(readRegistrationsForStats()).resolves.toBe(rows)
      expect(mockReadAll).toHaveBeenCalledWith({
        names: { '#class': 'class', '#group': 'group', '#handler': 'handler', '#key': 'key', '#owner': 'owner' },
        projection:
          'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #handler.membership, #owner.membership, owners, ownerHandles, #class, #group.#key',
      })
    })

    it('reads an empty table as no registrations', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      await expect(readRegistrationsForStats()).resolves.toEqual([])
    })
  })

  describe('readRegistrationConsistently', () => {
    it('reads the registration by event and id, strongly consistent', async () => {
      const registration = { eventId: 'e1', id: 'r1' }
      mockRead.mockResolvedValueOnce(registration)

      await expect(readRegistrationConsistently('e1', 'r1')).resolves.toBe(registration)
      expect(mockRead).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, undefined, true)
    })

    it('reads a missing registration as undefined', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(readRegistrationConsistently('e1', 'missing')).resolves.toBeUndefined()
    })
  })

  describe('registrationUpdateItem', () => {
    it('names the registration key and table around the update', () => {
      expect(
        registrationUpdateItem('e1', 'r1', {
          ConditionExpression: 'attribute_exists(id)',
          UpdateExpression: 'SET a = :a',
        })
      ).toEqual({
        Update: {
          ConditionExpression: 'attribute_exists(id)',
          Key: { eventId: 'e1', id: 'r1' },
          TableName: 'registration-table',
          UpdateExpression: 'SET a = :a',
        },
      })
    })
  })

  describe('transaction creation claims', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it.each([
      ['payment', 'paymentCreationAt', 'paymentCreationStamp'],
      ['refund', 'refundCreationAt', 'refundCreationStamp'],
    ] as const)('claims a %s creation unless a fresh one holds it', async (type, at, stamp) => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await expect(claimTransactionCreation(type, 'e1', 'r1', 'stamp-1', 300_000)).resolves.toBe(true)
      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            ConditionExpression: `attribute_not_exists(${at}) OR ${at} < :staleBefore`,
            ExpressionAttributeValues: {
              [`:${at}`]: '2026-10-19T12:00:00.000Z',
              ':staleBefore': '2026-10-19T11:55:00.000Z',
              ':stamp': 'stamp-1',
            },
            Key: { eventId: 'e1', id: 'r1' },
            TableName: 'registration-table',
            UpdateExpression: `SET ${at} = :${at}, ${stamp} = :stamp`,
          },
        },
      ])
    })

    it('answers false when another creation holds the claim', async () => {
      mockDocumentTransaction.mockRejectedValueOnce(namedError('TransactionCanceledException'))

      await expect(claimTransactionCreation('payment', 'e1', 'r1', 'stamp-1', 300_000)).resolves.toBe(false)
    })

    it('rethrows any other failure of the claim', async () => {
      const error = namedError('ProvisionedThroughputExceededException')
      mockDocumentTransaction.mockRejectedValueOnce(error)

      await expect(claimTransactionCreation('payment', 'e1', 'r1', 'stamp-1', 300_000)).rejects.toBe(error)
    })

    it.each([
      ['payment', 'paymentCreationAt', 'paymentCreationStamp'],
      ['refund', 'refundCreationAt', 'refundCreationStamp'],
    ] as const)('releases a %s creation only while its own stamp holds it', async (type, at, stamp) => {
      mockDocumentTransaction.mockResolvedValueOnce(undefined)

      await releaseTransactionCreation(type, 'e1', 'r1', 'stamp-1')

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            ConditionExpression: `${stamp} = :stamp`,
            ExpressionAttributeValues: { ':stamp': 'stamp-1' },
            Key: { eventId: 'e1', id: 'r1' },
            TableName: 'registration-table',
            UpdateExpression: `REMOVE ${at}, ${stamp}`,
          },
        },
      ])
    })

    it('logs a failed release instead of rejecting', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockDocumentTransaction.mockRejectedValueOnce(namedError('TransactionCanceledException'))

      await expect(releaseTransactionCreation('refund', 'e1', 'r1', 'stamp-1')).resolves.toBeUndefined()
      expect(loggedLines(errorSpy)).toContainEqual(
        expect.objectContaining({ message: 'failed to release creation claim', registrationId: 'r1', type: 'refund' })
      )
      errorSpy.mockRestore()
    })
  })

  describe('dropOpenTransactionId', () => {
    it('takes the id out of the open set, bumps updatedAt and answers the set as it was', async () => {
      mockUpdate.mockResolvedValueOnce({ Attributes: { openRefunds: ['t1', 't2'] } })

      await expect(dropOpenTransactionId('e1', 'r1', 'openRefunds', 't1', '2026-10-19T12:00:00.000Z')).resolves.toEqual(
        ['t1', 't2']
      )
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e1', id: 'r1' },
        { delete: { openRefunds: new Set(['t1']) }, set: { updatedAt: '2026-10-19T12:00:00.000Z' } },
        undefined,
        'UPDATED_OLD'
      )
    })

    it('answers undefined when the registration held no such set', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(
        dropOpenTransactionId('e1', 'r1', 'openPayments', 't1', '2026-10-19T12:00:00.000Z')
      ).resolves.toBeUndefined()
    })
  })

  describe('markDuplicatePayment', () => {
    it('marks the payment a duplicate and takes the id out of the open payments', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await markDuplicatePayment('e1', 'r1', 't1', '2026-10-19T12:00:00.000Z')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e1', id: 'r1' },
        {
          delete: { openPayments: new Set(['t1']) },
          set: { paymentStatus: 'DUPLICATE', updatedAt: '2026-10-19T12:00:00.000Z' },
        }
      )
    })
  })
})
