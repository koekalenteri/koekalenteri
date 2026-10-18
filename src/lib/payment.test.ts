import type {
  EventState,
  MinimalEventForCost,
  MinimalRegistrationForCost,
  PaymentPicture,
  PaymentTime,
  Registration,
} from '../types'
import { eventWithStaticDates } from '../__mockData__/events'
import { paymentPictureWith } from '../__mockData__/paymentPicture'
import {
  canRefundExcess,
  canRequestPaymentFor,
  getPaymentPicture,
  getProviderName,
  getRegistrationPaymentDetails,
  getShownPaymentDue,
  isInvitationAwaitingPayment,
  isPaymentInProgress,
  isPaymentUnsettled,
  isPaymentWaitingForPlace,
  isPaymentWaitingForPlaceInForm,
  isPaytrailRefusal,
  isRegistrationPaid,
  isStalePendingPayment,
  PROVIDER_NAMES,
  paytrailErrorMessage,
  paytrailErrorText,
  paytrailRefusalBody,
  STALE_PENDING_PAYMENT_AGE_MS,
  shouldSendInvitationAfterPayment,
  transactionActor,
} from './payment'
import { patchMerge } from './utils'

describe('payment', () => {
  // The one reading of a payment in progress, which PaymentCreate's 409 and the payment picture share.
  describe('isPaymentInProgress', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString()
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
    })
    afterEach(() => vi.useRealTimers())

    it.each<[string, Parameters<typeof isPaymentInProgress>[0], boolean]>([
      ['a fresh pending payment', { createdAt: minutesAgo(1), status: 'pending', type: 'payment' }, true],
      ['a stale pending payment', { createdAt: minutesAgo(6), status: 'pending', type: 'payment' }, false],
      ['a fresh pending refund', { createdAt: minutesAgo(1), status: 'pending', type: 'refund' }, false],
      ['a payment left new', { createdAt: minutesAgo(1), status: 'new', type: 'payment' }, false],
    ])('reads %s as in progress: %s', (_name, transaction, expected) => {
      expect(isPaymentInProgress(transaction)).toBe(expected)
    })
  })

  // A payment Paytrail has not finished counts as in progress for five minutes (KOE-1526).
  describe('isStalePendingPayment', () => {
    const now = new Date('2026-08-15T12:00:00.000Z')
    const ago = (ms: number) => new Date(now.getTime() - ms).toISOString()
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
    })
    afterEach(() => vi.useRealTimers())

    it.each<[string, string | undefined, string | undefined, boolean]>([
      ['no timestamp', undefined, undefined, false],
      ['an invalid date', 'not a date', undefined, false],
      ['under five minutes', ago(4 * 60 * 1000 + 59 * 1000), undefined, false],
      ['exactly five minutes', ago(STALE_PENDING_PAYMENT_AGE_MS), undefined, true],
      ['over five minutes', ago(10 * 60 * 1000), undefined, true],
      ['a recent status after an old creation', ago(10 * 60 * 1000), ago(60 * 1000), false],
      ['a status older than its creation', ago(60 * 1000), ago(10 * 60 * 1000), true],
    ])('with %s: %s', (_name, createdAt, statusAt, expected) => {
      expect(isStalePendingPayment(createdAt, statusAt)).toBe(expected)
    })
  })

  // KOE-1530: the one answer to where an entry's payment stands, and the order its status decides in.
  describe('getPaymentPicture', () => {
    const place = { key: '2026-08-15-ap' }
    type PictureRow = Partial<Parameters<typeof getPaymentPicture>[1]>
    type EventRow = Partial<Pick<typeof priced, 'cost' | 'costMember' | 'paymentTime' | 'state'>>
    const priced: {
      cost: number
      costMember: number
      entryStartDate: Date
      paymentTime: PaymentTime
      state: EventState
    } = {
      cost: 40,
      costMember: 35,
      entryStartDate: new Date('2026-01-01'),
      paymentTime: 'registration',
      state: 'confirmed',
    }
    const entry = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' as const },
      owner: { membership: false },
      ownerHandles: true,
    }
    const now = new Date('2026-08-15T12:00:00.000Z')
    const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString()
    const pending = { createdAt: minutesAgo(1), status: 'pending', type: 'payment' } as const
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(now)
    })
    afterEach(() => vi.useRealTimers())

    type Case = [
      name: string,
      event: EventRow,
      registration: PictureRow,
      openTransactions: Parameters<typeof getPaymentPicture>[2],
      expected: Partial<PaymentPicture>,
    ]

    // One row per branch of the status, in the order the rules decide it.
    it.each<Case>([
      [
        'a payment charged twice',
        {},
        { group: place, paidAmount: 40, paymentStatus: 'DUPLICATE' },
        [],
        { canPay: false, status: 'duplicate' },
      ],
      [
        'a duplicate outranks a payment in progress',
        {},
        { paymentStatus: 'DUPLICATE' },
        [pending],
        { status: 'duplicate' },
      ],
      ['a payment in progress', {}, { group: place }, [pending], { canPay: false, due: 40, status: 'inProgress' }],
      [
        'a payment in progress on a paid entry',
        {},
        { group: place, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [pending],
        { status: 'inProgress' },
      ],
      [
        'a payment left unfinished too long',
        {},
        { group: place },
        [{ ...pending, createdAt: minutesAgo(6) }],
        { canPay: true, status: 'unpaid' },
      ],
      [
        'a refund pending is not a payment in progress',
        {},
        { group: place },
        [{ ...pending, type: 'refund' }],
        { canPay: true, status: 'unpaid' },
      ],
      [
        'a returned fee of a reserve',
        {},
        { group: { key: 'reserve' }, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 40 },
        [],
        { canPay: false, due: 0, status: 'refunded' },
      ],
      [
        'a returned fee of a place owes again',
        {},
        { group: place, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 40 },
        [],
        { canPay: true, due: 40, status: 'unpaid' },
      ],
      [
        'a cancelled entry that had its fee back',
        {},
        { cancelled: true, group: { key: 'cancelled' }, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 40 },
        [],
        { canPay: false, due: 0, status: 'refunded' },
      ],
      [
        'a returned fee whose next payment was cancelled',
        {},
        { group: { key: 'reserve' }, paidAmount: 40, paymentStatus: 'CANCEL', refundAmount: 40 },
        [],
        { status: 'refunded' },
      ],
      [
        'a fee paid in part, a membership tick lost (KOE-722)',
        {},
        { group: place, owner: { membership: false }, paidAmount: 35, paymentStatus: 'SUCCESS' },
        [],
        { canPay: true, due: 5, status: 'partial' },
      ],
      [
        'a part payment whose rest was cancelled',
        {},
        { group: place, paidAmount: 30, paymentStatus: 'CANCEL' },
        [],
        { due: 10, status: 'partial' },
      ],
      [
        'a fee paid over',
        {},
        { group: place, owner: { membership: true }, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [],
        { canPay: false, canRefundExcess: true, due: 0, excess: 5, status: 'overpaid' },
      ],
      [
        'a fee paid in full',
        {},
        { group: place, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [],
        { canPay: false, due: 0, excess: 0, status: 'paid' },
      ],
      [
        'only an overpaid part refunded',
        {},
        { group: place, owner: { membership: true }, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 5 },
        [],
        { status: 'paid' },
      ],
      [
        'a payment recorded before the amounts were kept',
        {},
        { group: place, paymentStatus: 'SUCCESS' },
        [],
        { due: 0, standing: true, status: 'paid' },
      ],
      [
        'a trial that costs nothing',
        { cost: 0, costMember: 0 },
        { group: place },
        [],
        { canPay: false, due: 0, paidForPlace: true, status: 'notCharged' },
      ],
      [
        'a trial that is not confirmed',
        { state: 'tentative' },
        { group: place },
        [],
        { canPay: false, due: 0, status: 'notCharged' },
      ],
      [
        'a trial that is not confirmed holds a paid fee as paid',
        { state: 'cancelled' },
        { group: place, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [],
        { status: 'paid' },
      ],
      [
        'a trial that is not confirmed holds an overpaid fee as overpaid',
        { state: 'tentative' },
        { group: place, owner: { membership: true }, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [],
        { canRefundExcess: false, excess: 5, status: 'overpaid' },
      ],
      [
        'a paid fee in a trial that is not confirmed is not unsettled, whatever its mark',
        { state: 'tentative' },
        { group: place, paidAmount: 35, paidAt: new Date('2026-02-01'), paymentStatus: 'SUCCESS' },
        [],
        { unsettled: false },
      ],
      [
        'a payment in progress outranks a returned fee',
        {},
        { group: place, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 40 },
        [pending],
        { status: 'inProgress' },
      ],
      [
        'a payment in progress outranks a part payment',
        {},
        { group: place, paidAmount: 30, paymentStatus: 'SUCCESS' },
        [pending],
        { status: 'inProgress' },
      ],
      [
        'a duplicate outranks a returned fee',
        {},
        { group: { key: 'reserve' }, paidAmount: 40, paymentStatus: 'DUPLICATE', refundAmount: 40 },
        [],
        { status: 'duplicate' },
      ],
      [
        'a duplicate outranks a part payment',
        {},
        { group: place, paidAmount: 30, paymentStatus: 'DUPLICATE' },
        [],
        { canPay: false, status: 'duplicate' },
      ],
      [
        'a trial that is not confirmed holds a duplicate as duplicate',
        { state: 'tentative' },
        { paymentStatus: 'DUPLICATE' },
        [],
        { status: 'duplicate' },
      ],
      [
        'a reserve paying at confirmation waits for a place',
        { paymentTime: 'confirmation' },
        { group: { key: 'reserve' } },
        [],
        { canPay: false, due: 40, status: 'waitingForPlace' },
      ],
      [
        'an entry with no group paying at confirmation waits for a place',
        { paymentTime: 'confirmation' },
        {},
        [],
        { canPay: false, status: 'waitingForPlace' },
      ],
      [
        'a place paying at confirmation may pay before confirming',
        { paymentTime: 'confirmation' },
        { group: place },
        [],
        { canPay: true, status: 'unpaid' },
      ],
      [
        'a free place paying at confirmation waits for nothing',
        { cost: 0, costMember: 0, paymentTime: 'confirmation' },
        { group: place },
        [],
        { status: 'notCharged' },
      ],
      [
        'a paid reserve paying at confirmation is paid, not waiting',
        { paymentTime: 'confirmation' },
        { group: { key: 'reserve' }, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [],
        { status: 'paid' },
      ],
      [
        'a cancelled entry that paid too little owes nothing and is not offered paying',
        {},
        { cancelled: true, group: { key: 'cancelled' }, paidAmount: 30, paymentStatus: 'SUCCESS' },
        [],
        { canPay: false, due: 0 },
      ],
      [
        'a cancelled entry that never paid',
        {},
        { cancelled: true, group: { key: 'cancelled' } },
        [],
        { canPay: false, due: 0, status: 'notCharged' },
      ],
      ['an unpaid entry', {}, { group: place }, [], { canPay: true, due: 40, status: 'unpaid' }],
    ])('reads %s', (_name, eventOverrides, registration, openTransactions, expected) => {
      expect(
        getPaymentPicture({ ...priced, ...eventOverrides }, { ...entry, ...registration }, openTransactions)
      ).toEqual(expect.objectContaining(expected))
    })

    // The place is a place whether or not a payment is held back (KOE-1526).
    it('does not offer a held-back payment at confirmation-time payment to a reserve either', () => {
      const picture = getPaymentPicture(
        { ...priced, paymentTime: 'confirmation' },
        { ...entry, group: { key: 'reserve' }, paymentStatus: 'DUPLICATE' },
        []
      )
      expect(picture).toEqual(expect.objectContaining({ canPay: false, status: 'duplicate' }))
    })

    it('always has every key, with an empty value for nothing', () => {
      const picture = getPaymentPicture(priced, { ...entry, cancelled: true, group: { key: 'cancelled' } }, [])
      expect(picture).toEqual({
        canPay: false,
        canRefund: false,
        canRefundExcess: false,
        due: 0,
        excess: 0,
        keptFee: 0,
        paidAmount: 0,
        paidForPlace: false,
        refundedAmount: 0,
        standing: false,
        status: 'notCharged',
        unsettled: false,
      })
    })

    it('reports the amounts of a returned fee', () => {
      const picture = getPaymentPicture(
        priced,
        { ...entry, group: place, paidAmount: 50, paymentStatus: 'SUCCESS', refundAmount: 45, refundHandlingCost: 5 },
        []
      )
      expect(picture).toEqual(expect.objectContaining({ keptFee: 5, paidAmount: 50, refundedAmount: 45 }))
    })

    // The invitation and the cancel dialog read this, not the status: part paid, overpaid, free and
    // charged twice all count as paid for the place, a fee that went back does not.
    it.each<[string, EventRow, PictureRow, boolean]>([
      ['unpaid', {}, { group: place }, false],
      ['part paid', {}, { group: place, paidAmount: 20, paymentStatus: 'SUCCESS' }, true],
      ['paid in full', {}, { group: place, paidAmount: 40, paymentStatus: 'SUCCESS' }, true],
      ['overpaid', {}, { group: place, owner: { membership: true }, paidAmount: 40, paymentStatus: 'SUCCESS' }, true],
      ['free', { cost: 0, costMember: 0 }, { group: place }, true],
      ['charged twice', {}, { group: place, paidAmount: 40, paymentStatus: 'DUPLICATE' }, true],
      ['returned', {}, { group: place, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 40 }, false],
      ['unpaid in a trial not confirmed', { state: 'tentative' }, { group: place }, false],
    ])(
      'reads paidForPlace for an entry that is %s as isRegistrationPaid does',
      (_name, eventOverrides, registration, expected) => {
        const event = { ...priced, ...eventOverrides }
        const row = { ...entry, ...registration }
        expect(getPaymentPicture(event, row, []).paidForPlace).toBe(expected)
        expect(isRegistrationPaid(event, row)).toBe(expected)
      }
    )

    // The mark of a payment is what makes a fee unsettled: a never-paid place is just unpaid.
    it.each<[string, PictureRow, boolean]>([
      ['a part missing', { paidAmount: 35, paidAt: new Date('2026-02-01'), paymentStatus: 'SUCCESS' }, true],
      [
        'paid over',
        { owner: { membership: true }, paidAmount: 40, paidAt: new Date('2026-02-01'), paymentStatus: 'SUCCESS' },
        true,
      ],
      ['paid exactly', { paidAmount: 40, paidAt: new Date('2026-02-01'), paymentStatus: 'SUCCESS' }, false],
      ['never paid', {}, false],
    ])('reads unsettled for %s', (_name, registration, expected) => {
      expect(getPaymentPicture(priced, { ...entry, group: place, ...registration }, []).unsettled).toBe(expected)
    })

    it('reads the refund permissions from the group and the money standing', () => {
      const paid = { ...entry, paidAmount: 40, paymentStatus: 'SUCCESS' as const }
      expect(getPaymentPicture(priced, { ...paid, group: place }, []).canRefund).toBe(false)
      expect(getPaymentPicture(priced, { ...paid, group: { key: 'reserve' } }, []).canRefund).toBe(true)
      expect(getPaymentPicture(priced, { ...paid, cancelled: true, group: { key: 'cancelled' } }, []).canRefund).toBe(
        true
      )
    })

    it('can be sent to a patch twice and end with the last picture', () => {
      const first = getPaymentPicture(priced, { ...entry, group: place, paidAmount: 35, paymentStatus: 'SUCCESS' }, [])
      const second = getPaymentPicture(priced, { ...entry, group: place, paidAmount: 40, paymentStatus: 'SUCCESS' }, [])
      expect(patchMerge({ payment: first }, { payment: second })).toEqual({ payment: second })
    })
  })

  describe('getShownPaymentDue', () => {
    const shown = { ...eventWithStaticDates, cost: 40, costMember: 35 }
    const member = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' as const },
      owner: { membership: true },
      ownerHandles: true,
    }
    const unpaid = { ...member, owner: { membership: false } }
    const pictureOf = (due: number): PaymentPicture => ({
      canPay: due > 0,
      canRefund: false,
      canRefundExcess: false,
      due,
      excess: 0,
      keptFee: 0,
      paidAmount: 35,
      paidForPlace: false,
      refundedAmount: 35,
      standing: false,
      status: due > 0 ? 'unpaid' : 'refunded',
      unsettled: false,
    })

    it('shows what is owed once the trial is confirmed', () => {
      expect(getShownPaymentDue({ ...shown, state: 'confirmed' }, unpaid)).toBe(40)
    })

    it('shows nothing owed before the trial is confirmed', () => {
      expect(getShownPaymentDue({ ...shown, state: 'tentative' }, unpaid)).toBe(0)
    })

    it('reads a paid place as the form has it, so a change shows at once (KOE-722)', () => {
      expect(getShownPaymentDue({ ...shown, state: 'confirmed' }, { ...unpaid, paidAmount: 35 })).toBe(5)
    })

    // For a fee that went back only the server knows the group; its due is taken as it is. Read
    // here, the same row would be a reserve's (no group), owing nothing.
    it.each([
      ['nothing for a reserve, as the server says', 0, 0],
      ['the fee again once it has a place, as the server says', 35, 35],
    ])('reads a fee that went back as %s', (_name, due, expected) => {
      const returned = { ...member, paidAmount: 35, payment: pictureOf(due), refundAmount: 35 }
      expect(getShownPaymentDue({ ...shown, state: 'confirmed' }, returned)).toBe(expected)
    })

    it('reads a returned fee itself when a response came without the picture', () => {
      expect(
        getShownPaymentDue({ ...shown, state: 'confirmed' }, { ...member, paidAmount: 35, refundAmount: 35 })
      ).toBe(0)
    })
  })

  // The form's own reading of an entry that has no picture yet (a new one, the secretary's).
  describe('isPaymentWaitingForPlaceInForm', () => {
    const at = (paymentTime: PaymentTime, registration: Parameters<typeof isPaymentWaitingForPlaceInForm>[1]) =>
      isPaymentWaitingForPlaceInForm({ paymentTime }, registration)
    const picture = (overrides: Partial<PaymentPicture>) => paymentPictureWith(overrides)

    // The participant's row: no group, the picture decides.
    it.each<[string, Partial<PaymentPicture>, boolean]>([
      ['paying is offered', { canPay: true, status: 'unpaid' }, false],
      ['paying is not offered', { canPay: false, status: 'waitingForPlace' }, true],
      ['a free class (nothing owed yet)', { status: 'notCharged' }, true],
      ['a payment in progress', { status: 'inProgress' }, false],
      ['a payment charged twice', { status: 'duplicate' }, false],
    ])('on a row with no group, when %s', (_name, overrides, expected) => {
      expect(at('confirmation', { payment: picture(overrides) })).toBe(expected)
    })

    it('never waits on a row with a picture when the trial is paid at entry', () => {
      expect(at('registration', { payment: picture({ canPay: false, status: 'unpaid' }) })).toBe(false)
    })

    // The secretary's row, with its group, and a new entry: the group decides.
    it.each([
      ['a row in a place', { group: { key: '2026-08-15-ap' } }, false],
      ['a row on the reserve list', { group: { key: 'reserve' } }, true],
      ['a new entry, with neither group nor picture', {}, true],
    ])('reads %s by the group', (_name, registration, expected) => {
      expect(at('confirmation', registration)).toBe(expected)
    })
  })

  describe('isPaymentWaitingForPlace', () => {
    it.each<[string, Parameters<typeof isPaymentWaitingForPlace>[1], boolean]>([
      ['a payment charged twice', { paymentStatus: 'DUPLICATE' }, false],
      ["a secretary's row in a place", { group: { key: '2026-08-15-ap' } }, false],
      ["a secretary's row on the reserve list", { group: { key: 'reserve' } }, true],
      ['a new entry', {}, true],
    ])('at confirmation-time payment, %s', (_name, registration, expected) => {
      expect(isPaymentWaitingForPlace({ paymentTime: 'confirmation' }, registration)).toBe(expected)
    })

    it('never waits when the trial is paid at entry', () => {
      expect(isPaymentWaitingForPlace({ paymentTime: 'registration' }, {})).toBe(false)
    })
  })

  // KOE-1526 review: the secretary's request is the pay offer read from a row without transactions.
  describe('canRequestPaymentFor', () => {
    const event = { cost: 40, costMember: 40, entryStartDate: new Date('2026-01-01'), state: 'confirmed' as const }
    const owing = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' as const },
      owner: { membership: false },
      ownerHandles: true,
    }

    it.each([
      ['an unpaid entry', {}, true],
      // A legacy PENDING, or no open payments loaded (the secretary's row never has them): neither
      // holds the request back any more (KOE-1529).
      ['a legacy stored PENDING', { paymentStatus: 'PENDING' as const }, true],
      ['a payment charged twice', { paymentStatus: 'DUPLICATE' as const }, false],
      ['a paid entry', { paidAmount: 40, paymentStatus: 'SUCCESS' as const }, false],
    ])('for %s: %s', (_name, overrides, expected) => {
      expect(canRequestPaymentFor(event, { ...owing, ...overrides })).toBe(expected)
    })

    it('asks nothing for a trial that is not confirmed', () => {
      expect(canRequestPaymentFor({ ...event, state: 'cancelled' }, owing)).toBe(false)
    })
  })

  describe('isPaytrailRefusal', () => {
    it.each([
      ['a marked refusal', { error: 'Revert failed', provider: 'paytrail' }, true],
      ['a marked refusal without words', { error: '', provider: 'paytrail' }, true],
      ['a marked body without an error', { provider: 'paytrail' }, false],
      ["the API's own error", { error: 'Forbidden' }, false],
      ['another provider', { error: 'x', provider: 'nordea' }, false],
      ['text', 'Refund already in progress', false],
    ])('takes %s as %s', (_case, body, expected) => {
      expect(isPaytrailRefusal(body)).toBe(expected)
    })
  })

  // What PaymentCreate and RefundCreate answer when Paytrail refuses, and isPaytrailRefusal reads it back.
  describe('paytrailRefusalBody', () => {
    it.each([
      ['its words', '{"message":"Rejected"}', '{"message":"Rejected"}'],
      ['an empty error for no words', undefined, ''],
    ])('marks a refusal with %s', (_case, error, expected) => {
      const body = paytrailRefusalBody(error)

      expect(body).toEqual({ error: expected, provider: 'paytrail' })
      expect(isPaytrailRefusal(body)).toBe(true)
    })
  })

  // What Paytrail said: its JSON `message`, else whatever text it gave (an HTML or plain 5xx, or why
  // the request failed), else nothing (KOE-1511).
  describe('paytrailErrorText', () => {
    it.each([
      [
        'its JSON message',
        JSON.stringify({ message: 'Revert failed', status: 'error' }),
        'Revert failed',
        'Revert failed',
      ],
      ['JSON without a message as it came', JSON.stringify({ status: 'error' }), '{"status":"error"}', undefined],
      ['JSON with an empty message as it came', JSON.stringify({ message: '' }), '{"message":""}', undefined],
      ['a JSON value that is not an object as it came', '"busy"', '"busy"', undefined],
      ['plain text as it came', 'Service Unavailable', 'Service Unavailable', undefined],
      ['nothing for an empty answer', '', undefined, undefined],
      ['nothing for no answer', undefined, undefined, undefined],
    ])('reads %s', (_case, error, text, message) => {
      expect(paytrailErrorText(error)).toBe(text)
      expect(paytrailErrorMessage(error)).toBe(message)
    })
  })

  describe('getProviderName', () => {
    it.each(Object.entries(PROVIDER_NAMES))('should return provider name from map', (id, name) => {
      expect(getProviderName(id)).toEqual(name)
    })

    it('should fallback to capitalizing name', () => {
      expect(getProviderName('test')).toEqual('Test')
    })
  })

  describe('transactionActor', () => {
    it('names the user the transaction recorded', () => {
      expect(transactionActor({ user: 'Test User' })).toEqual({ name: 'Test User' })
    })

    it('keeps the mark of a name taken from the registration', () => {
      expect(transactionActor({ user: 'Payer Name', userSource: 'registration' })).toEqual({
        name: 'Payer Name',
        source: 'registration',
      })
    })

    it('falls back to anonymous for a transaction without a user', () => {
      expect(transactionActor({})).toEqual({ name: 'anonymous' })
    })
  })

  describe('isRegistrationPaid', () => {
    const event: MinimalEventForCost = { cost: 40, costMember: 40, entryStartDate: new Date('2026-01-01') }
    const registration: MinimalRegistrationForCost &
      Pick<Registration, 'paymentStatus' | 'refundAmount' | 'refundHandlingCost'> = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' },
      owner: { membership: false },
      ownerHandles: true,
    }

    it('is not paid when nothing has been paid for a place that costs', () => {
      expect(isRegistrationPaid(event, registration)).toBe(false)
    })

    it('is paid when the payment succeeded', () => {
      expect(isRegistrationPaid(event, { ...registration, paidAmount: 40, paymentStatus: 'SUCCESS' })).toBe(true)
    })

    it('is paid when only part of the fee has arrived', () => {
      expect(isRegistrationPaid(event, { ...registration, paidAmount: 10 })).toBe(true)
    })

    it('is paid when the place costs nothing', () => {
      expect(isRegistrationPaid({ ...event, cost: 0, costMember: 0 }, registration)).toBe(true)
    })

    it('is not paid while the payment is only pending', () => {
      expect(isRegistrationPaid(event, { ...registration, paymentStatus: 'PENDING' })).toBe(false)
    })

    it('is paid when a payment was recorded before the amounts were kept', () => {
      expect(isRegistrationPaid(event, { ...registration, paymentStatus: 'SUCCESS' })).toBe(true)
    })

    it.each([
      ['in full', { refundAmount: 40, refundHandlingCost: 0 }],
      ['less a handling fee', { refundAmount: 35, refundHandlingCost: 5 }],
    ])('is not paid once the payment was refunded %s (KOE-1526)', (_name, refund) => {
      expect(isRegistrationPaid(event, { ...registration, paidAmount: 40, paymentStatus: 'SUCCESS', ...refund })).toBe(
        false
      )
    })

    it('is paid when part of the payment is left after a refund (KOE-1526)', () => {
      expect(
        isRegistrationPaid(event, {
          ...registration,
          paidAmount: 50,
          paymentStatus: 'SUCCESS',
          refundAmount: 35,
          refundHandlingCost: 5,
        })
      ).toBe(true)
    })
  })

  describe('invitation payment gate', () => {
    // The ALO class has been invited; the trial itself is only picked, as it is when one class is ahead.
    const event = {
      classes: [{ class: 'ALO' as const, state: 'invited' as const }],
      cost: 40,
      costMember: 40,
      entryStartDate: new Date('2026-01-01'),
      state: 'picked' as const,
    }
    const participant = {
      class: 'ALO' as const,
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' as const },
      eventType: 'NOME-B',
      group: { key: 'ALO-AP', number: 3 },
      messagesSent: { picked: true },
      owner: { membership: false },
      ownerHandles: true,
    }
    const paid = { ...participant, paidAmount: 40, paymentStatus: 'SUCCESS' as const }

    it('waits for an unpaid place lifted into an invited class', () => {
      expect(isInvitationAwaitingPayment(event, participant)).toBe(true)
      expect(shouldSendInvitationAfterPayment(event, participant)).toBe(false)
    })

    it('waits for a reserve whose fee was refunded and that is then lifted into a place (KOE-1526)', () => {
      const refunded = { ...paid, refundAmount: 40, refundHandlingCost: 0 }
      expect(isInvitationAwaitingPayment(event, refunded)).toBe(true)
      expect(shouldSendInvitationAfterPayment(event, refunded)).toBe(false)
    })

    it('sends once that place is paid for', () => {
      expect(isInvitationAwaitingPayment(event, paid)).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, paid)).toBe(true)
    })

    it('leaves a dog on the reserve list out of both', () => {
      const reserve = { ...participant, group: { key: 'reserve', number: 1 } }

      expect(isInvitationAwaitingPayment(event, reserve)).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, { ...reserve, ...paid, group: reserve.group })).toBe(false)
    })

    it('leaves a cancelled entry out of both', () => {
      const cancelled = { ...paid, cancelled: true }

      expect(isInvitationAwaitingPayment(event, { ...participant, cancelled: true })).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, cancelled)).toBe(false)
    })

    it('waits for the class to be invited', () => {
      const pickedEvent = { ...event, classes: [{ class: 'ALO' as const, state: 'picked' as const }] }

      expect(isInvitationAwaitingPayment(pickedEvent, participant)).toBe(false)
      expect(shouldSendInvitationAfterPayment(pickedEvent, paid)).toBe(false)
    })

    it('does not repeat an invitation that has been sent', () => {
      const invited = { ...paid, messagesSent: { invitation: true, picked: true } }

      expect(isInvitationAwaitingPayment(event, { ...participant, messagesSent: invited.messagesSent })).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, invited)).toBe(false)
    })
  })

  describe('getRegistrationPaymentDetails', () => {
    const event: MinimalEventForCost = {
      cost: 10,
      costMember: 5,
      entryStartDate: new Date('2026-01-01'),
    }
    const registration: MinimalRegistrationForCost = {
      createdAt: new Date('2026-01-02'),
      dog: {},
      ownerHandles: true,
    }

    it('should return details for non-member', () => {
      expect(getRegistrationPaymentDetails(event, { ...registration, owner: { membership: false } })).toEqual({
        cost: 10,
        isMember: false,
        optionalCosts: [],
        strategy: 'legacy',
        total: 10,
      })
    })

    it('should return details for member', () => {
      expect(getRegistrationPaymentDetails(event, { ...registration, owner: { membership: true } })).toEqual({
        cost: 5,
        isMember: true,
        optionalCosts: [],
        strategy: 'legacy',
        total: 5,
      })
    })

    it('should return details with optional costs', () => {
      const eventWithOptional = {
        ...event,
        cost: {
          normal: 10,
          optionalAdditionalCosts: [{ cost: 2, description: { fi: 'test' } }],
        },
      }
      const registrationWithOptional = {
        ...registration,
        optionalCosts: [0],
        owner: { membership: false },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 10,
        costObject: {
          normal: 10,
          optionalAdditionalCosts: [
            {
              cost: 2,
              description: {
                fi: 'test',
              },
            },
          ],
        },
        isMember: false,
        optionalCosts: [{ cost: 2, description: { fi: 'test' } }],
        strategy: 'normal',
        total: 12,
        translationOptions: {
          code: undefined,
          end: undefined,
          start: undefined,
        },
      })
    })
    it('should return details for early bird', () => {
      // A Finnish midnight in winter time; the window's end keeps that time of day ten days on.
      const entryStartDate = new Date('2026-01-01T22:00:00.000Z')
      const eventWithOptional = {
        ...event,
        cost: {
          earlyBird: {
            cost: 7,
            days: 10,
          },
          normal: 10,
        },
        entryStartDate,
      }
      const registrationWithOptional = {
        ...registration,
        createdAt: new Date('2026-01-03T10:00:00.000Z'),
        owner: { membership: false },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 7,
        costObject: {
          earlyBird: {
            cost: 7,
            days: 10,
          },
          normal: 10,
        },
        isMember: false,
        optionalCosts: [],
        strategy: 'earlyBird',
        total: 7,
        translationOptions: {
          code: undefined,
          end: new Date('2026-01-10T22:00:00.000Z'),
          start: entryStartDate,
        },
      })
    })

    it('should return details for breed', () => {
      const eventWithOptional = {
        ...event,
        cost: {
          breed: {
            '101': 6,
          },
          normal: 10,
        },
      }
      const registrationWithOptional = {
        ...registration,
        dog: { breedCode: '101' as const },
        owner: { membership: false },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 6,
        costObject: {
          breed: {
            '101': 6,
          },
          normal: 10,
        },
        isMember: false,
        optionalCosts: [],
        strategy: 'breed',
        total: 6,
        translationOptions: {
          code: '101',
          end: undefined,
          start: undefined,
        },
      })
    })

    it('should return details for custom cost', () => {
      const eventWithOptional = {
        ...event,
        cost: {
          custom: {
            cost: 1,
            description: { en: 'Volunteer', fi: 'Talkoolainen' },
          },
          normal: 10,
        },
      }
      const registrationWithOptional = {
        ...registration,
        owner: { membership: false },
        selectedCost: 'custom' as const,
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 1,
        costObject: {
          custom: {
            cost: 1,
            description: {
              en: 'Volunteer',
              fi: 'Talkoolainen',
            },
          },
          normal: 10,
        },
        isMember: false,
        optionalCosts: [],
        strategy: 'custom',
        total: 1,
        translationOptions: {
          code: undefined,
          end: undefined,
          start: undefined,
        },
      })
    })
  })

  describe('overpaid fee', () => {
    const event: MinimalEventForCost = { cost: 40, costMember: 35, entryStartDate: new Date('2026-01-01') }
    const member: MinimalRegistrationForCost = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' },
      owner: { membership: true },
      ownerHandles: true,
    }

    describe('canRefundExcess', () => {
      it('lets a participant who paid the full price as a member have the difference back (KOE-1382)', () => {
        expect(canRefundExcess(event, { ...member, paidAmount: 40 })).toBe(true)
      })

      it('has nothing to return once the difference has been refunded', () => {
        expect(canRefundExcess(event, { ...member, paidAmount: 40, refundAmount: 5 })).toBe(false)
      })

      it('has nothing to return when the member price was paid', () => {
        expect(canRefundExcess(event, { ...member, paidAmount: 35 })).toBe(false)
      })

      it('leaves a cancelled entry to the ordinary refund', () => {
        expect(canRefundExcess(event, { ...member, cancelled: true, paidAmount: 40 })).toBe(false)
      })
    })

    describe('isPaymentUnsettled', () => {
      const paidAt = new Date('2026-01-03')

      it('is unsettled when a part is missing or paid over', () => {
        expect(isPaymentUnsettled(event, { ...member, paidAmount: 40, paidAt })).toBe(true)
        expect(isPaymentUnsettled(event, { ...member, owner: { membership: false }, paidAmount: 35, paidAt })).toBe(
          true
        )
      })

      it('is settled when the fee has been paid as it reads', () => {
        expect(isPaymentUnsettled(event, { ...member, paidAmount: 35, paidAt })).toBe(false)
      })

      it('is not unsettled, only unpaid, when nothing has been paid', () => {
        expect(isPaymentUnsettled(event, member)).toBe(false)
      })

      // The prod row of KOE-1526: reserve #1, paid 40 and had all of it back.
      const refundedReserve = {
        ...member,
        group: { key: 'reserve', number: 1 },
        owner: { membership: false },
        paidAmount: 40,
        paidAt,
        paymentStatus: 'SUCCESS' as const,
        refundAmount: 40,
        refundHandlingCost: 0,
      }

      it('is settled for a reserve whose fee was refunded (KOE-1526)', () => {
        expect(isPaymentUnsettled(event, refundedReserve)).toBe(false)
      })

      it('is settled, with nothing to refund, once the lifted reserve has paid its fee again (KOE-1526)', () => {
        // Paid 40, had 35 back with 5 kept, lifted, paid 40 again: the kept 5 is not paid over.
        const repaid = {
          ...refundedReserve,
          group: { key: '2026-08-15-ap', number: 1 },
          paidAmount: 80,
          refundAmount: 35,
          refundHandlingCost: 5,
        }
        expect(isPaymentUnsettled(event, repaid)).toBe(false)
        expect(canRefundExcess(event, repaid)).toBe(false)
      })

      it('is unsettled when that reserve is lifted into a place (KOE-1526)', () => {
        const place = { key: '2026-08-15-ap', number: 1 }
        expect(isPaymentUnsettled(event, { ...refundedReserve, group: place })).toBe(true)
      })
    })
  })
})
