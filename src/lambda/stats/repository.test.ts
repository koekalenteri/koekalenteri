import type { JsonConfirmedEvent } from '../../types'
import { jest } from '@jest/globals'
import { createStatsRepository } from './repository'

const makeEvent = (overrides: Partial<JsonConfirmedEvent> = {}): JsonConfirmedEvent =>
  ({
    id: 'event-1',
    organizer: { id: 'org-1', name: 'Org' },
    startDate: '2025-06-01',
    ...overrides,
  }) as JsonConfirmedEvent

describe('createStatsRepository contract', () => {
  it('maps organizer event deltas to one atomic add/set update', async () => {
    const update = jest.fn(async () => undefined)
    const repository = createStatsRepository({ db: { update } as any })

    await repository.addOrganizerEventDeltas(makeEvent(), {
      cancelledDelta: 1,
      paidAmountDelta: 15,
      paidDelta: 1,
      refundedAmountDelta: 5,
      refundedDelta: 1,
      totalDelta: 2,
    })

    expect(update).toHaveBeenCalledWith(
      { PK: 'ORG#org-1', SK: '2025-06-01#event-1' },
      {
        add: {
          cancelledRegistrations: 1,
          count: 2,
          paidAmount: 15,
          paidRegistrations: 1,
          refundedAmount: 5,
          refundedRegistrations: 1,
        },
        set: {
          date: '2025-06-01',
          organizerId: 'org-1',
          updatedAt: expect.any(String),
        },
      }
    )
  })

  it('returns previousCount from UPDATED_OLD when incrementing entity count', async () => {
    const update = jest.fn(async () => ({ Attributes: { count: 3 } }))
    const repository = createStatsRepository({ db: { update } as any })

    await expect(repository.incrementEntityCount(2025, 'dog', 'hash-1')).resolves.toEqual({ previousCount: 3 })
    expect(update).toHaveBeenCalledWith(
      { PK: 'STAT#2025#dog', SK: 'hash-1' },
      { add: { count: 1 } },
      undefined,
      'UPDATED_OLD'
    )
  })

  it('updates bucket counters when dog#handler count crosses bucket boundary', async () => {
    const update = jest.fn(async () => undefined)
    const repository = createStatsRepository({ db: { update } as any })

    await repository.updateDogHandlerBucket(2025, 4, 5)

    expect(update).toHaveBeenCalledWith({ PK: 'BUCKETS#2025#dog#handler', SK: '4' }, { add: { count: -1 } })
    expect(update).toHaveBeenCalledWith({ PK: 'BUCKETS#2025#dog#handler', SK: '5-9' }, { add: { count: 1 } })
  })
})
