import { jest } from '@jest/globals'
import { createPaymentTransactionRepository } from './repository'

describe('payment/repository translation', () => {
  const db: any = {
    query: jest.fn(),
    read: jest.fn(),
    update: jest.fn(),
    write: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('translates listByReference to query with gsiReference semantics', async () => {
    db.query.mockResolvedValueOnce([])
    const repo = createPaymentTransactionRepository({ db: db as any })

    await repo.listByReference('event123:reg456')

    expect(db.query).toHaveBeenCalledWith({
      index: 'gsiReference',
      key: '#reference = :reference',
      names: { '#reference': 'reference' },
      values: { ':reference': 'event123:reg456' },
    })
  })

  it('translates patchStatus to update with remove paymentResponse by default', async () => {
    const now = new Date('2026-01-01T10:00:00.000Z')
    jest.spyOn(global, 'Date').mockImplementation(() => now as any)
    const repo = createPaymentTransactionRepository({ db: db as any })

    await repo.patchStatus({ transactionId: 'tx123' } as any, { status: 'fail' })

    expect(db.update).toHaveBeenCalledWith(
      { transactionId: 'tx123' },
      {
        remove: ['paymentResponse'],
        set: {
          status: 'fail',
          statusAt: now.toISOString(),
        },
      }
    )
  })
})
