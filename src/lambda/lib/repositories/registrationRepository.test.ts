import type { JsonEmailDeliveryStatus, JsonKcResult } from '../../../types'
import { vi } from 'vitest'
import { jsonRegistrationsToEventWithALOInvited } from '../../../__mockData__/registrations'
import { loggedLines } from '../../test-utils/logs'

const mockBatchWrite = vi.fn()
const mockQuery = vi.fn()
const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockUpdate = vi.fn()
const mockWrite = vi.fn()
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
    batchWrite = (...args: unknown[]) => mockBatchWrite(...args)
    documentTransaction = (...args: unknown[]) => mockDocumentTransaction(...args)
    query = (...args: unknown[]) => mockQuery(...args)
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
    write = (...args: unknown[]) => mockWrite(...args)
  },
}))

const {
  claimTransactionCreation,
  dropOpenTransactionId,
  claimNewRegistrationPostProcessing,
  clearRegistrationEmailDeliveryStatus,
  markNewRegistrationPhase,
  newRegistrationStatsMarkItem,
  readEventRegistrations,
  readRegistration,
  readRegistrationEventIds,
  readRegistrationsForStats,
  registrationUpdateItem,
  releaseTransactionCreation,
  removeRegistrationField,
  updateRegistrationField,
  writeEmailDeliveryStatus,
  writeKcResult,
  writeMigratedRegistration,
  writeRegistration,
  writeRegistrationFields,
  writeRegistrations,
} = await import('./registrationRepository')

const namedError = (name: string) => {
  const error = new Error(name)
  error.name = name
  return error
}

describe('registrationRepository', () => {
  beforeEach(() => {
    mockBatchWrite.mockReset()
    mockQuery.mockReset()
    mockRead.mockReset()
    mockReadAll.mockReset()
    mockUpdate.mockReset()
    mockWrite.mockReset()
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

  describe('readRegistration', () => {
    it.each([false, true])('reads the registration by event and id (consistent: %s)', async (consistent) => {
      const registration = { eventId: 'e1', id: 'r1' }
      mockRead.mockResolvedValueOnce(registration)

      await expect(readRegistration('e1', 'r1', consistent)).resolves.toBe(registration)
      expect(mockRead).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, consistent)
    })

    it('reads eventually consistent by default', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await readRegistration('e1', 'r1')

      expect(mockRead).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, false)
    })

    it('reads a missing registration as undefined', async () => {
      mockRead.mockResolvedValueOnce(undefined)

      await expect(readRegistration('e1', 'missing')).resolves.toBeUndefined()
    })
  })

  describe('readEventRegistrations', () => {
    it('queries every registration of the event, whatever its state', async () => {
      const registrations = [
        { eventId: 'e1', id: 'r1', state: 'ready' },
        { eventId: 'e1', id: 'r2', state: 'creating' },
      ]
      mockQuery.mockResolvedValueOnce(registrations)

      await expect(readEventRegistrations('e1')).resolves.toBe(registrations)
      expect(mockQuery).toHaveBeenCalledWith({ key: 'eventId = :eventId', values: { ':eventId': 'e1' } })
    })

    it('queries strongly consistent when asked', async () => {
      mockQuery.mockResolvedValueOnce([])

      await readEventRegistrations('e1', true)

      expect(mockQuery).toHaveBeenCalledWith({
        consistent: true,
        key: 'eventId = :eventId',
        values: { ':eventId': 'e1' },
      })
    })

    it('reads an event without registrations as an empty list', async () => {
      mockQuery.mockResolvedValueOnce(undefined)

      await expect(readEventRegistrations('e1')).resolves.toEqual([])
    })
  })

  describe('readRegistrationEventIds', () => {
    it("names every event of the table's rows once, the deleted rows' included", async () => {
      mockReadAll.mockResolvedValueOnce([{ eventId: 'e1' }, { eventId: 'e2' }, { eventId: 'e1' }])

      await expect(readRegistrationEventIds()).resolves.toEqual(['e1', 'e2'])
      expect(mockReadAll).toHaveBeenCalledWith({ includeDeleted: true, projection: 'eventId' })
    })

    it('reads an empty table as no events', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      await expect(readRegistrationEventIds()).resolves.toEqual([])
    })
  })

  describe('writeMigratedRegistration', () => {
    const changes = { set: { 'group.date': '2026-06-01', updatedAt: 'now' } }

    it('writes on condition the row exists and still has the updatedAt read', async () => {
      await writeMigratedRegistration('e1', 'r1', changes, 'read')

      expect(mockUpdate).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, changes, undefined, {
        expression: 'attribute_exists(#id) AND #updatedAt = :foldedFrom',
        names: { '#id': 'id', '#updatedAt': 'updatedAt' },
        values: { ':foldedFrom': 'read' },
      })
    })

    it('holds a row read without updatedAt to still having none', async () => {
      await writeMigratedRegistration('e1', 'r1', changes, undefined)

      expect(mockUpdate).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, changes, undefined, {
        expression: 'attribute_exists(#id) AND attribute_not_exists(#updatedAt)',
        names: { '#id': 'id', '#updatedAt': 'updatedAt' },
      })
    })
  })

  describe('writes', () => {
    const [first, second] = jsonRegistrationsToEventWithALOInvited

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('puts the whole registration', async () => {
      mockWrite.mockResolvedValueOnce(undefined)

      await expect(writeRegistration(first)).resolves.toBeUndefined()
      expect(mockWrite).toHaveBeenCalledWith(first)
    })

    it('puts the registrations in batches', async () => {
      mockBatchWrite.mockResolvedValueOnce(undefined)

      await writeRegistrations([first, second])

      expect(mockBatchWrite).toHaveBeenCalledWith([first, second])
    })

    it('sets and removes fields with no condition', async () => {
      const changes = { remove: ['cancelReason'], set: { cancelled: false, group: { key: 'reserve', number: 2 } } }

      await writeRegistrationFields('e1', 'r1', changes)

      expect(mockUpdate).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, changes)
    })

    it('sets one field and bumps updatedAt', async () => {
      await updateRegistrationField('e1', 'r1', 'internalNotes', 'note')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e1', id: 'r1' },
        { set: { internalNotes: 'note', updatedAt: '2026-10-19T12:00:00.000Z' } }
      )
    })

    it('removes one field and bumps updatedAt', async () => {
      await removeRegistrationField('e1', 'r1', 'internalNotes')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e1', id: 'r1' },
        { remove: ['internalNotes'], set: { updatedAt: '2026-10-19T12:00:00.000Z' } }
      )
    })

    it('clears the email delivery status and bumps updatedAt', async () => {
      await clearRegistrationEmailDeliveryStatus('e1', 'r1')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e1', id: 'r1' },
        { remove: ['emailDeliveryStatus'], set: { updatedAt: '2026-10-19T12:00:00.000Z' } }
      )
    })
  })

  describe('writeEmailDeliveryStatus', () => {
    const status: JsonEmailDeliveryStatus = { at: '2026-10-19T12:00:00.000Z', email: 'a@example.com', status: 'bounce' }

    it('stores the status only on an existing registration', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(writeEmailDeliveryStatus('e1', 'r1', status)).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'e1', id: 'r1' },
        { set: { emailDeliveryStatus: status } },
        undefined,
        { expression: 'attribute_exists(#id)', names: { '#id': 'id' } }
      )
    })

    it('answers false when the registration is not in this table', async () => {
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(writeEmailDeliveryStatus('e1', 'r1', status)).resolves.toBe(false)
    })

    it('rethrows any other failure', async () => {
      const error = namedError('ProvisionedThroughputExceededException')
      mockUpdate.mockRejectedValueOnce(error)

      await expect(writeEmailDeliveryStatus('e1', 'r1', status)).rejects.toBe(error)
    })
  })

  describe('writeKcResult', () => {
    const kcResult: JsonKcResult = { at: '2026-10-19T12:00:00.000Z', by: 'Secretary', status: 'sent' }
    const updatedAt = '2026-10-19T12:00:00.000Z'

    it('writes the first result only where none is stored', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(writeKcResult('e1', 'r1', kcResult, undefined, updatedAt)).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, { set: { kcResult, updatedAt } }, 'NONE', {
        expression: 'attribute_exists(#id) AND attribute_not_exists(#kcResult)',
        names: { '#at': 'at', '#id': 'id', '#kcResult': 'kcResult' },
      })
    })

    it('writes over the result it was read from only', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await expect(writeKcResult('e1', 'r1', kcResult, '2026-10-18T12:00:00.000Z', updatedAt)).resolves.toBe(true)
      expect(mockUpdate).toHaveBeenCalledWith({ eventId: 'e1', id: 'r1' }, { set: { kcResult, updatedAt } }, 'NONE', {
        expression: 'attribute_exists(#id) AND #kcResult.#at = :at',
        names: { '#at': 'at', '#id': 'id', '#kcResult': 'kcResult' },
        values: { ':at': '2026-10-18T12:00:00.000Z' },
      })
    })

    it('answers false when another send wrote first', async () => {
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(writeKcResult('e1', 'r1', kcResult, undefined, updatedAt)).resolves.toBe(false)
    })

    it('rethrows any other failure', async () => {
      const error = namedError('ProvisionedThroughputExceededException')
      mockUpdate.mockRejectedValueOnce(error)

      await expect(writeKcResult('e1', 'r1', kcResult, undefined, updatedAt)).rejects.toBe(error)
    })
  })

  describe('new registration post-processing', () => {
    const registration = { eventId: 'event-1', id: 'registration-1' }
    const leaseCondition = {
      expression: '#newRegistrationLease.#token = :token',
      names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
    }

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-07-27T12:00:00.000Z'))
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('claims an expired or absent lease and reads the registration consistently', async () => {
      mockUpdate.mockResolvedValueOnce({})
      mockRead.mockResolvedValueOnce(registration)

      const claim = await claimNewRegistrationPostProcessing('event-1', 'registration-1')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'event-1', id: 'registration-1' },
        { set: { newRegistrationLease: { expiresAt: Date.now() + 90_000, token: claim?.token } } },
        undefined,
        {
          expression:
            'attribute_exists(#id) AND (attribute_not_exists(#newRegistrationLease) OR #newRegistrationLease.#expiresAt < :now)',
          names: { '#expiresAt': 'expiresAt', '#id': 'id', '#newRegistrationLease': 'newRegistrationLease' },
          values: { ':now': Date.now() },
        }
      )
      expect(mockRead).toHaveBeenCalledWith({ eventId: 'event-1', id: 'registration-1' }, true)
      expect(claim?.registration).toBe(registration)
    })

    it('answers undefined when another worker holds the lease', async () => {
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(claimNewRegistrationPostProcessing('event-1', 'registration-1')).resolves.toBeUndefined()
      expect(mockRead).not.toHaveBeenCalled()
    })

    it('fails when the registration disappears while being claimed', async () => {
      mockUpdate.mockResolvedValueOnce({})
      mockRead.mockResolvedValueOnce(undefined)

      await expect(claimNewRegistrationPostProcessing('event-1', 'registration-1')).rejects.toThrow(
        "Registration 'registration-1' disappeared while claiming post-processing"
      )
    })

    it('releases only its own lease and ignores a lease that was taken over', async () => {
      mockUpdate.mockResolvedValueOnce({})
      mockRead.mockResolvedValueOnce(registration)
      const claim = await claimNewRegistrationPostProcessing('event-1', 'registration-1')
      mockUpdate.mockRejectedValueOnce(namedError('ConditionalCheckFailedException'))

      await expect(claim?.release()).resolves.toBeUndefined()

      expect(mockUpdate).toHaveBeenLastCalledWith(
        { eventId: 'event-1', id: 'registration-1' },
        { remove: ['newRegistrationLease'] },
        undefined,
        { ...leaseCondition, values: { ':token': claim?.token } }
      )
    })

    it('marks a phase only while the caller holds the lease', async () => {
      mockUpdate.mockResolvedValueOnce({})

      await markNewRegistrationPhase('event-1', 'registration-1', 'lease-token', 'newRegistrationEmailSentAt')

      expect(mockUpdate).toHaveBeenCalledWith(
        { eventId: 'event-1', id: 'registration-1' },
        { set: { newRegistrationEmailSentAt: '2026-07-27T12:00:00.000Z' } },
        undefined,
        { ...leaseCondition, values: { ':token': 'lease-token' } }
      )
    })
  })

  describe('newRegistrationStatsMarkItem', () => {
    it("marks the registration counted while it exists, is not counted yet and the caller's lease holds", () => {
      expect(newRegistrationStatsMarkItem('e1', 'r1', 'lease-token', '2026-10-19T12:00:00.000Z')).toEqual({
        Update: {
          ConditionExpression:
            'attribute_exists(#id) AND attribute_not_exists(#statsAt) AND #lease.#token = :leaseToken',
          ExpressionAttributeNames: {
            '#id': 'id',
            '#lease': 'newRegistrationLease',
            '#statsAt': 'newRegistrationStatsAt',
            '#token': 'token',
          },
          ExpressionAttributeValues: { ':leaseToken': 'lease-token', ':statsAt': '2026-10-19T12:00:00.000Z' },
          Key: { eventId: 'e1', id: 'r1' },
          TableName: 'registration-table',
          UpdateExpression: 'SET #statsAt = :statsAt',
        },
      })
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
})
