import type { JsonConfirmedEvent } from '../../../types'
import { eventWithStaticDates } from '../../../__mockData__/events'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import {
  buildEventPatchPayload,
  buildEventViewersPayload,
  buildParticipantPaymentPatch,
  buildRegistrationPatchPayload,
  toEventViewers,
} from './payloads'

describe('ws/payloads', () => {
  it('buildEventPatchPayload returns event id with patch fields', () => {
    const result = buildEventPatchPayload('e1', {
      classes: [{ class: 'ALO', date: '2026-01-01' }],
      entries: 7,
    })

    expect(result).toEqual({
      classes: [{ class: 'ALO', date: '2026-01-01' }],
      entries: 7,
      eventId: 'e1',
    })
  })

  it('buildRegistrationPatchPayload wraps patch array with event id', () => {
    const patch = [{ dog: { name: 'Nelli' }, id: 'r1' }]
    expect(buildRegistrationPatchPayload('e1', patch)).toEqual({ eventId: 'e1', patch })
  })

  it('buildParticipantPaymentPatch exposes only participant payment state', () => {
    // A reserve whose fee went back: the state is worked out from the same row (KOE-1526).
    const event: JsonConfirmedEvent = JSON.parse(JSON.stringify({ ...eventWithStaticDates, cost: 50, costMember: 50 }))
    const row = {
      ...JSON.parse(JSON.stringify(registrationWithStaticDates)),
      confirmed: true,
      eventId: 'e1',
      group: { key: 'reserve', number: 1 },
      id: 'r1',
      internalNotes: 'secret',
      messagesSent: undefined,
      paidAmount: 50,
      paidAt: '2026-08-16T10:00:00.000Z',
      paymentStatus: 'SUCCESS',
      refundAmount: 50,
      refundAt: '2026-08-17T11:37:27.000Z',
      refundHandlingCost: 0,
      refundStatus: 'SUCCESS',
      state: 'ready',
      updatedAt: undefined,
    }
    expect(buildParticipantPaymentPatch(row, event)).toEqual({
      confirmed: true,
      eventId: 'e1',
      id: 'r1',
      messagesSent: undefined,
      paidAmount: 50,
      paidAt: '2026-08-16T10:00:00.000Z',
      paymentDue: 0,
      paymentStatus: 'SUCCESS',
      // The page reads the refund to know whether to take the due from the server (KOE-1526).
      refundAmount: 50,
      refundAt: '2026-08-17T11:37:27.000Z',
      refundHandlingCost: 0,
      refundStatus: 'SUCCESS',
      shouldPay: false,
      state: 'ready',
      updatedAt: undefined,
    })
  })

  it('buildEventViewersPayload returns admin scope payload', () => {
    const viewers = [
      { name: 'User One', userId: 'u1' },
      { name: 'User Two', userId: 'u2' },
    ]
    expect(buildEventViewersPayload('e1', viewers)).toEqual({
      eventId: 'e1',
      scope: 'admin:event-viewers',
      viewers,
    })
  })

  it('toEventViewers returns distinct viewers in connection order', () => {
    const connections = [
      { connectionId: 'c1', userId: 'matti', userName: 'Matti Meikäläinen' },
      { connectionId: 'c2' },
      { connectionId: 'c3', userEmail: 'anna@example.com', userId: 'anna' },
      { connectionId: 'c4', userEmail: 'other@example.com', userId: 'matti', userName: 'Other Matti' },
      { connectionId: 'c5', userId: 'åke' },
    ]

    expect(toEventViewers(connections)).toEqual([
      { name: 'Matti Meikäläinen', userId: 'matti' },
      { name: 'anna@example.com', userId: 'anna' },
      { name: 'åke', userId: 'åke' },
    ])
  })
})
