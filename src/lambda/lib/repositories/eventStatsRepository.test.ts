import type CustomDynamoClient from '../../utils/CustomDynamoClient'
import { vi } from 'vitest'

const mockQuery = vi.fn()
const mockRead = vi.fn()
const mockReadAll = vi.fn()
const mockUpdate = vi.fn()
const mockBatchWrite = vi.fn<CustomDynamoClient['batchWrite']>()
const mockBatchDelete = vi.fn<CustomDynamoClient['batchDelete']>()
const mockDocumentTransaction = vi.fn<CustomDynamoClient['documentTransaction']>()
const mockConstructor = vi.fn()

vi.doMock('../../config', () => ({
  CONFIG: { eventStatsTable: 'event-stats-table', registrationTable: 'registration-table' },
}))

vi.doMock('../../utils/CustomDynamoClient', () => ({
  default: class MockCustomDynamoClient {
    constructor(table: string) {
      mockConstructor(table)
    }
    batchDelete = mockBatchDelete
    batchWrite = mockBatchWrite
    documentTransaction = mockDocumentTransaction
    query = (...args: unknown[]) => mockQuery(...args)
    read = (...args: unknown[]) => mockRead(...args)
    readAll = (...args: unknown[]) => mockReadAll(...args)
    update = (...args: unknown[]) => mockUpdate(...args)
  },
}))

const {
  addOrganizerEventStats,
  capacitySk,
  commitNewRegistrationStats,
  deleteStatRecords,
  isSameOrganizerStatsRow,
  moveOrganizerEventStatsRow,
  organizerPk,
  organizerStatsKey,
  readAllOrganizerEventStats,
  readAllStatKeys,
  readBreedStarts,
  readBuckets,
  readCapacityStats,
  readEventBreakdown,
  readJudgeWorkload,
  readOrganizerEventStats,
  readOrganizerEventStatsRow,
  readRetention,
  readStatsYears,
  readYearlyBreakdown,
  readYearlyTotals,
  writeStatRecords,
} = await import('./eventStatsRepository')

const ORGANIZER_STATS_NAMES = {
  '#cancelledRegistrations': 'cancelledRegistrations',
  '#count': 'count',
  '#date': 'date',
  '#memberRegistrations': 'memberRegistrations',
  '#organizerId': 'organizerId',
  '#paidAmount': 'paidAmount',
  '#paidRegistrations': 'paidRegistrations',
  '#refundedAmount': 'refundedAmount',
  '#refundedRegistrations': 'refundedRegistrations',
  '#reserveRegistrations': 'reserveRegistrations',
  '#updatedAt': 'updatedAt',
}

const deltas = {
  cancelledDelta: 1,
  memberDelta: 2,
  paidAmountDelta: 30,
  paidDelta: 4,
  refundedAmountDelta: 5,
  refundedDelta: 6,
  reserveDelta: 7,
  totalDelta: 8,
}

const NOW = '2026-10-18T12:00:00.000Z'

describe('eventStatsRepository', () => {
  beforeEach(() => {
    mockQuery.mockReset().mockResolvedValue([])
    mockRead.mockReset()
    mockReadAll.mockReset().mockResolvedValue([])
    mockUpdate.mockReset().mockResolvedValue({})
    mockBatchWrite.mockReset().mockResolvedValue(undefined)
    mockBatchDelete.mockReset().mockResolvedValue(undefined)
    mockDocumentTransaction.mockReset().mockResolvedValue({ $metadata: {} })
  })

  it('opens its client on the event stats table', () => {
    expect(mockConstructor).toHaveBeenCalledWith('event-stats-table')
  })

  it('keys an organizer row by organizer and by start date and event', () => {
    expect(organizerStatsKey({ id: 'e1', organizer: { id: 'org1' }, startDate: '2024-06-01' })).toEqual({
      PK: 'ORG#org1',
      SK: '2024-06-01#e1',
    })
  })

  it('keys a capacity row by month, class and organizer, and an organizer partition by organizer', () => {
    expect(capacitySk('2025-06', 'ALO', 'org-1')).toBe('2025-06#ALO#org-1')
    expect(organizerPk('org-1')).toBe('ORG#org-1')
  })

  describe('isSameOrganizerStatsRow', () => {
    const event = { id: 'e1', organizer: { id: 'org1' }, startDate: '2024-06-01' }

    it('is the same row while neither the organizer nor the start date changed', () => {
      expect(isSameOrganizerStatsRow(event, { ...event })).toBe(true)
    })

    it.each([
      ['the organizer', { ...event, organizer: { id: 'org2' } }],
      ['the start date', { ...event, startDate: '2024-06-02' }],
    ])('is another row when %s changed', (_change, updated) => {
      expect(isSameOrganizerStatsRow(event, updated)).toBe(false)
    })
  })

  describe('readOrganizerEventStats', () => {
    it('queries the organizer partition with the date filters', async () => {
      const rows = [{ count: 10, organizerId: 'org1' }]
      mockQuery.mockResolvedValueOnce(rows)

      await expect(readOrganizerEventStats('org1', '2024-01-01', '2024-12-31')).resolves.toBe(rows)
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: 'SK >= :from AND SK <= :to',
        key: '#pk = :pk',
        names: { '#pk': 'PK' },
        values: { ':from': '2024-01-01', ':pk': 'ORG#org1', ':to': '2024-12-31' },
      })
    })

    it('queries without a filter when no range is given, and reads nothing as empty', async () => {
      mockQuery.mockResolvedValueOnce(undefined)

      await expect(readOrganizerEventStats('org1')).resolves.toEqual([])
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk',
        names: { '#pk': 'PK' },
        values: { ':pk': 'ORG#org1' },
      })
    })
  })

  describe('readAllOrganizerEventStats', () => {
    it('scans every organizer row with the date filters', async () => {
      const rows = [{ count: 10, organizerId: 'org1', PK: 'ORG#org1', SK: '2024-02-01#e1' }]
      mockReadAll.mockResolvedValueOnce(rows)

      await expect(readAllOrganizerEventStats('2024-01-01', '2024-12-31')).resolves.toBe(rows)
      expect(mockReadAll).toHaveBeenCalledWith({
        filter: 'begins_with(#pk, :orgPrefix) AND SK >= :from AND SK <= :to',
        names: { '#pk': 'PK' },
        values: { ':from': '2024-01-01', ':orgPrefix': 'ORG#', ':to': '2024-12-31' },
      })
    })

    it('scans only by prefix without a range, and reads nothing as empty', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      await expect(readAllOrganizerEventStats()).resolves.toEqual([])
      expect(mockReadAll).toHaveBeenCalledWith({
        filter: 'begins_with(#pk, :orgPrefix)',
        names: { '#pk': 'PK' },
        values: { ':orgPrefix': 'ORG#' },
      })
    })
  })

  describe('partition readers', () => {
    it.each([
      ['readYearlyTotals', () => readYearlyTotals(2024), 'TOTALS#2024'],
      ['readRetention', () => readRetention(2024), 'RETENTION#2024'],
      ['readYearlyBreakdown', () => readYearlyBreakdown(2024, 'eventType'), 'STAT#2024#eventType'],
      ['readBreedStarts', () => readBreedStarts(2024), 'STAT#2024#breedStart'],
      ['readBuckets dog#handler', () => readBuckets(2024, 'dog#handler'), 'BUCKETS#2024#dog#handler'],
      ['readBuckets dogsPerHandler', () => readBuckets(2024, 'dogsPerHandler'), 'BUCKETS#2024#dogsPerHandler'],
      ['readStatsYears', () => readStatsYears(), 'YEARS'],
      ['readEventBreakdown', () => readEventBreakdown(2024), 'BREAKDOWN#2024'],
    ])('%s queries its partition and returns the rows', async (_name, read, pk) => {
      const rows = [{ count: 1, SK: 'x' }]
      mockQuery.mockResolvedValueOnce(rows)

      await expect(read()).resolves.toBe(rows)
      expect(mockQuery).toHaveBeenCalledWith({ key: 'PK = :pk', values: { ':pk': pk } })
    })

    it('reads a partition with nothing in it as empty', async () => {
      mockQuery.mockResolvedValueOnce(null)

      await expect(readYearlyTotals(2023)).resolves.toEqual([])
    })
  })

  describe('readCapacityStats', () => {
    it('queries the event type partition without a range or a filter', async () => {
      await readCapacityStats('NOME-B')

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk',
        names: { '#pk': 'PK' },
        values: { ':pk': 'CAPACITY#NOME-B' },
      })
    })

    it('filters to the organizers given', async () => {
      await readCapacityStats('NOME-B', ['org-1', 'org-2'])

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: '#organizerId IN (:organizerId0, :organizerId1)',
        key: '#pk = :pk',
        names: { '#organizerId': 'organizerId', '#pk': 'PK' },
        values: { ':organizerId0': 'org-1', ':organizerId1': 'org-2', ':pk': 'CAPACITY#NOME-B' },
      })
    })

    it('bounds the query with a padded upper bound so the whole "to" month is included', async () => {
      await readCapacityStats('NOU', undefined, '2025-01', '2025-06')

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk AND SK BETWEEN :from AND :to',
        names: { '#pk': 'PK' },
        values: { ':from': '2025-01', ':pk': 'CAPACITY#NOU', ':to': '2025-06#￿' },
      })
    })

    it('supports an open-ended lower or upper bound', async () => {
      await readCapacityStats('NOU', undefined, '2025-01')
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk AND SK >= :from',
        names: { '#pk': 'PK' },
        values: { ':from': '2025-01', ':pk': 'CAPACITY#NOU' },
      })

      await readCapacityStats('NOU', undefined, undefined, '2025-06')
      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk AND SK <= :to',
        names: { '#pk': 'PK' },
        values: { ':pk': 'CAPACITY#NOU', ':to': '2025-06#￿' },
      })
    })

    it('reads nothing as empty', async () => {
      mockQuery.mockResolvedValueOnce(undefined)

      await expect(readCapacityStats('NOU')).resolves.toEqual([])
    })
  })

  describe('readJudgeWorkload', () => {
    it('queries the year unfiltered when no organizers are given', async () => {
      await readJudgeWorkload(2024)

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: undefined,
        key: '#pk = :pk',
        names: { '#pk': 'PK' },
        values: { ':pk': 'JUDGE#2024' },
      })
    })

    it('filters to the organizers given', async () => {
      await readJudgeWorkload(2024, ['org1', 'org2'])

      expect(mockQuery).toHaveBeenCalledWith({
        filterExpression: '#organizerId IN (:organizerId0, :organizerId1)',
        key: '#pk = :pk',
        names: { '#organizerId': 'organizerId', '#pk': 'PK' },
        values: { ':organizerId0': 'org1', ':organizerId1': 'org2', ':pk': 'JUDGE#2024' },
      })
    })

    it('reads nothing as empty', async () => {
      mockQuery.mockResolvedValueOnce(undefined)

      await expect(readJudgeWorkload(2024)).resolves.toEqual([])
    })
  })

  describe('addOrganizerEventStats', () => {
    it('adds the deltas to the organizer row and stamps it', async () => {
      await addOrganizerEventStats({ id: 'e5', organizer: { id: 'org1' }, startDate: '2024-01-01' }, deltas, NOW)

      expect(mockUpdate).toHaveBeenCalledWith(
        { PK: 'ORG#org1', SK: '2024-01-01#e5' },
        {
          add: {
            cancelledRegistrations: 1,
            count: 8,
            memberRegistrations: 2,
            paidAmount: 30,
            paidRegistrations: 4,
            refundedAmount: 5,
            refundedRegistrations: 6,
            reserveRegistrations: 7,
          },
          set: { date: '2024-01-01', organizerId: 'org1', updatedAt: NOW },
        }
      )
    })
  })

  describe('readOrganizerEventStatsRow', () => {
    it('reads the row consistently so a just-counted registration is not missed', async () => {
      const row = { count: 7, PK: 'ORG#org1', SK: '2024-06-15#e5' }
      mockRead.mockResolvedValueOnce(row)

      await expect(
        readOrganizerEventStatsRow({ id: 'e5', organizer: { id: 'org1' }, startDate: '2024-06-15' })
      ).resolves.toBe(row)
      expect(mockRead).toHaveBeenCalledWith({ PK: 'ORG#org1', SK: '2024-06-15#e5' }, undefined, true)
    })
  })

  describe('moveOrganizerEventStatsRow', () => {
    const existing = { id: 'e5', organizer: { id: 'org1' }, startDate: '2024-06-15T00:00:00.000Z' }
    const updated = { id: 'e5', organizer: { id: 'org2' }, startDate: '2025-01-01T00:00:00.000Z' }
    const stats = {
      cancelledRegistrations: 1,
      count: 7,
      memberRegistrations: 2,
      PK: 'ORG#org1',
      paidAmount: 350,
      paidRegistrations: 3,
      refundedAmount: 20,
      refundedRegistrations: 1,
      reserveRegistrations: 4,
      SK: '2024-06-15T00:00:00.000Z#e5',
    }
    const destination = {
      Update: {
        ExpressionAttributeNames: ORGANIZER_STATS_NAMES,
        ExpressionAttributeValues: {
          ':cancelledRegistrations': 1,
          ':count': 7,
          ':date': '2025-01-01T00:00:00.000Z',
          ':memberRegistrations': 2,
          ':organizerId': 'org2',
          ':paidAmount': 350,
          ':paidRegistrations': 3,
          ':refundedAmount': 20,
          ':refundedRegistrations': 1,
          ':reserveRegistrations': 4,
          ':updatedAt': NOW,
        },
        Key: { PK: 'ORG#org2', SK: '2025-01-01T00:00:00.000Z#e5' },
        TableName: 'event-stats-table',
        UpdateExpression:
          'ADD #cancelledRegistrations :cancelledRegistrations, #count :count, #memberRegistrations :memberRegistrations, #paidAmount :paidAmount, #paidRegistrations :paidRegistrations, #refundedAmount :refundedAmount, #refundedRegistrations :refundedRegistrations, #reserveRegistrations :reserveRegistrations SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
      },
    }

    it('adds the counters into the destination and deletes the source on the updatedAt it read', async () => {
      await moveOrganizerEventStatsRow(existing, updated, { ...stats, updatedAt: '2024-06-20T00:00:00.000Z' }, NOW)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        destination,
        {
          Delete: {
            ConditionExpression: '#updatedAt = :expectedUpdatedAt',
            ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
            ExpressionAttributeValues: { ':expectedUpdatedAt': '2024-06-20T00:00:00.000Z' },
            Key: { PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' },
            TableName: 'event-stats-table',
          },
        },
      ])
    })

    it('deletes a source that was never stamped only while it still has no updatedAt', async () => {
      await moveOrganizerEventStatsRow(existing, updated, stats, NOW)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        destination,
        {
          Delete: {
            ConditionExpression: 'attribute_not_exists(#updatedAt)',
            ExpressionAttributeNames: { '#updatedAt': 'updatedAt' },
            ExpressionAttributeValues: undefined,
            Key: { PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' },
            TableName: 'event-stats-table',
          },
        },
      ])
    })

    it('carries missing counters over as zero', async () => {
      await moveOrganizerEventStatsRow(existing, updated, { PK: 'ORG#org1', SK: '2024-06-15T00:00:00.000Z#e5' }, NOW)

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: expect.objectContaining({
            ExpressionAttributeValues: {
              ':cancelledRegistrations': 0,
              ':count': 0,
              ':date': '2025-01-01T00:00:00.000Z',
              ':memberRegistrations': 0,
              ':organizerId': 'org2',
              ':paidAmount': 0,
              ':paidRegistrations': 0,
              ':refundedAmount': 0,
              ':refundedRegistrations': 0,
              ':reserveRegistrations': 0,
              ':updatedAt': NOW,
            },
          }),
        },
        expect.anything(),
      ])
    })

    it('passes a cancelled transaction on to the caller', async () => {
      mockDocumentTransaction.mockRejectedValueOnce({ name: 'TransactionCanceledException' })

      await expect(moveOrganizerEventStatsRow(existing, updated, stats, NOW)).rejects.toEqual({
        name: 'TransactionCanceledException',
      })
    })
  })

  describe('commitNewRegistrationStats', () => {
    it('adds the deltas to the organizer row and marks the registration counted in one transaction', async () => {
      await commitNewRegistrationStats(
        { id: 'event-1', organizer: { id: 'organizer-1' }, startDate: '2024-06-01' },
        deltas,
        { eventId: 'event-1', id: 'registration-1' },
        'lease-token',
        NOW
      )

      expect(mockDocumentTransaction).toHaveBeenCalledWith([
        {
          Update: {
            ExpressionAttributeNames: ORGANIZER_STATS_NAMES,
            ExpressionAttributeValues: {
              ':cancelledDelta': 1,
              ':date': '2024-06-01',
              ':memberDelta': 2,
              ':organizerId': 'organizer-1',
              ':paidAmountDelta': 30,
              ':paidDelta': 4,
              ':refundedAmountDelta': 5,
              ':refundedDelta': 6,
              ':reserveDelta': 7,
              ':totalDelta': 8,
              ':updatedAt': NOW,
            },
            Key: { PK: 'ORG#organizer-1', SK: '2024-06-01#event-1' },
            TableName: 'event-stats-table',
            UpdateExpression:
              'ADD #cancelledRegistrations :cancelledDelta, #count :totalDelta, #memberRegistrations :memberDelta, #paidAmount :paidAmountDelta, #paidRegistrations :paidDelta, #refundedAmount :refundedAmountDelta, #refundedRegistrations :refundedDelta, #reserveRegistrations :reserveDelta SET #date = :date, #organizerId = :organizerId, #updatedAt = :updatedAt',
          },
        },
        {
          Update: {
            ConditionExpression:
              'attribute_exists(#id) AND attribute_not_exists(#statsAt) AND #lease.#token = :leaseToken',
            ExpressionAttributeNames: {
              '#id': 'id',
              '#lease': 'newRegistrationLease',
              '#statsAt': 'newRegistrationStatsAt',
              '#token': 'token',
            },
            ExpressionAttributeValues: { ':leaseToken': 'lease-token', ':statsAt': NOW },
            Key: { eventId: 'event-1', id: 'registration-1' },
            TableName: 'registration-table',
            UpdateExpression: 'SET #statsAt = :statsAt',
          },
        },
      ])
    })
  })

  describe('rebuild rows', () => {
    it('reads the key of every row', async () => {
      const keys = [{ PK: 'TOTALS#2025', SK: 'dog' }]
      mockReadAll.mockResolvedValueOnce(keys)

      await expect(readAllStatKeys()).resolves.toBe(keys)
      expect(mockReadAll).toHaveBeenCalledWith({ projection: 'PK, SK' })
    })

    it('reads an empty table as no keys', async () => {
      mockReadAll.mockResolvedValueOnce(undefined)

      await expect(readAllStatKeys()).resolves.toEqual([])
    })

    it('writes the rows as given', async () => {
      const records = [{ count: 3, PK: 'TOTALS#2025', SK: 'dog', updatedAt: NOW }]

      await writeStatRecords(records)

      expect(mockBatchWrite).toHaveBeenCalledWith(records)
    })

    it('deletes by key alone, whatever else the rows carry', async () => {
      const records = [{ count: 3, PK: 'TOTALS#2025', SK: 'dog', updatedAt: NOW }]

      await deleteStatRecords(records)

      expect(mockBatchDelete).toHaveBeenCalledWith([{ PK: 'TOTALS#2025', SK: 'dog' }])
    })

    // The retry of unprocessed items is the client's (CustomDynamoClient.test.ts); a batch it
    // gives up on rejects, and the rebuild must see that.
    it('passes on a batch the client could not finish', async () => {
      mockBatchWrite.mockRejectedValueOnce(new Error('left unprocessed after 5 attempts'))
      mockBatchDelete.mockRejectedValueOnce(new Error('left unprocessed after 5 attempts'))

      await expect(writeStatRecords([{ PK: 'TOTALS#2025', SK: 'dog' }])).rejects.toThrow('left unprocessed')
      await expect(deleteStatRecords([{ PK: 'TOTALS#2025', SK: 'dog' }])).rejects.toThrow('left unprocessed')
    })
  })
})
