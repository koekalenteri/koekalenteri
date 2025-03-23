import { jest } from '@jest/globals'

const mockQuery = jest.fn<any>()
jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    query: mockQuery,
  })),
}))

const { formatGroupAuditInfo, findQualificationStartDate } = await import('./event')

describe('formatGroupAuditInfo', () => {
  it('should format properly', () => {
    expect(formatGroupAuditInfo({ key: 'cancelled', number: 5 })).toEqual('Peruneet #5')
    expect(formatGroupAuditInfo({ key: 'reserve', number: 1 })).toEqual('Ilmoittautuneet #1')
    expect(
      formatGroupAuditInfo({ key: '2024-08-02-ip', date: '2024-08-02T21:00:00.000Z', number: 20, time: 'ip' })
    ).toEqual('la 3.8. ip #20')
  })
})

describe('findQualificationStartDate', () => {
  it('should call query with proper arguments', async () => {
    await findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())

    expect(mockQuery).toHaveBeenCalledWith(
      'eventType = :eventType AND entryEndDate < :entryEndDate',
      { ':entryEndDate': '2025-03-22T17:00:00.000Z', ':eventType': 'NOME-B SM' },
      'event-table-not-found-in-env',
      'gsiEventTypeEntryEndDate',
      undefined,
      false,
      1
    )
  })
  it.each([undefined, [], [{}], [1, 2]])('should return undefined when query returns %p', (result) => {
    mockQuery.mockResolvedValueOnce(result)
    expect(
      findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())
    ).resolves.toBeUndefined()
  })

  it('should return start of next day from the entryEndDate', () => {
    mockQuery.mockResolvedValueOnce([{ entryEndDate: '2024-08-20T23:59:59.999+03:00' }])
    expect(findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())).resolves.toEqual(
      '2024-08-21T00:00:00.000+03:00'
    )
  })

  it('should prefer entryOrigEndDate when available ', () => {
    mockQuery.mockResolvedValueOnce([
      { entryEndDate: '2024-08-20T23:59:59.999+03:00', entryOrigEndDate: '2024-08-15T23:59:59.999+03:00' },
    ])
    expect(findQualificationStartDate('NOME-B SM', new Date('2025-03-22T17:00:00Z').toISOString())).resolves.toEqual(
      '2024-08-16T00:00:00.000+03:00'
    )
  })
})
