import type { EventState, MinimalEventForCost, MinimalRegistrationForCost, PaymentPicture, PaymentTime } from '../types'
import type { PaymentTerms } from './payment'
import { eventWithStaticDates } from '../__mockData__/events'
import { paymentPictureWith } from '../__mockData__/paymentPicture'
import {
  getFormPayment,
  getPaymentPicture,
  getProviderName,
  getRegistrationPaymentDetails,
  hasEarlyBirdPrice,
  hasPaymentLockingRegistrations,
  isPaymentInProgress,
  isPaytrailRefusal,
  isStalePendingPayment,
  PROVIDER_NAMES,
  paymentTermsDiffer,
  paytrailErrorMessage,
  paytrailErrorText,
  paytrailRefusalBody,
  STALE_PENDING_PAYMENT_AGE_MS,
  transactionActor,
} from './payment'
import { patchMerge } from './utils'

describe('payment', () => {
  // The rule the event form locks its payment fields by, and PutEvent refuses a change by (KOE-1568).
  describe('payment terms lock', () => {
    const earlyBird = { earlyBird: { cost: 30, days: 7 }, normal: 40 }
    const terms = {
      cost: { normal: 40 },
      costMember: { normal: 35 },
      entryStartDate: '2025-04-01T00:00:00.000+03:00',
      paymentTime: 'registration' as const,
    }

    it.each([
      ['no registrations', false, []],
      ['a completed one', true, [{ state: 'ready' as const }]],
      ['only ones waiting for their payment', false, [{ state: 'creating' as const }, {}]],
    ])('hasPaymentLockingRegistrations with %s is %s', (_name, expected, registrations) => {
      expect(hasPaymentLockingRegistrations(registrations)).toBe(expected)
    })

    it.each([
      [{ cost: 40 }, false],
      [{ cost: { normal: 40 } }, false],
      [{ cost: earlyBird }, true],
      [{ cost: 40, costMember: earlyBird }, true],
      // A rate that counts no days applies to no one, as cost.ts reads it.
      [{ cost: { earlyBird: { cost: 30, days: 0 }, normal: 40 } }, false],
      [{}, false],
      [{ cost: null }, false],
    ])('hasEarlyBirdPrice(%o) is %s', (input, expected) => {
      expect(hasEarlyBirdPrice(input)).toBe(expected)
    })

    it.each<[string, PaymentTerms, PaymentTerms?]>([
      ['the same terms in new objects', { ...terms, cost: { normal: 40 } }],
      ['a legacy number price as its object', { ...terms }, { ...terms, cost: 40, costMember: 35 }],
      ['no payment time as paid at registration', { ...terms, paymentTime: undefined }],
      ['a moved entry start without an early-bird rate', { ...terms, entryStartDate: '2025-04-03T00:00:00.000+03:00' }],
      [
        'the entry start as a Date of the same moment',
        { ...terms, cost: earlyBird, entryStartDate: new Date('2025-03-31T21:00:00.000Z') },
        { ...terms, cost: earlyBird },
      ],
      [
        'a moved entry start when the early-bird rate counts no days',
        {
          ...terms,
          cost: { earlyBird: { cost: 30, days: 0 }, normal: 40 },
          entryStartDate: '2025-04-03T00:00:00.000+03:00',
        },
        { ...terms, cost: { earlyBird: { cost: 30, days: 0 }, normal: 40 } },
      ],
      [
        'an early-bird event without an entry start on either side',
        { ...terms, cost: earlyBird, entryStartDate: undefined },
        { ...terms, cost: earlyBird, entryStartDate: null },
      ],
    ])('sees no change in %s', (_name, after, before = terms) => {
      expect(paymentTermsDiffer(before, after)).toBe(false)
    })

    it.each([
      ['the price', { ...terms, cost: { normal: 45 } }],
      ['the member price', { ...terms, costMember: 30 }],
      ['a breed price', { ...terms, cost: { breed: { '110': 30 }, normal: 40 } }],
      [
        'an optional cost',
        { ...terms, cost: { normal: 40, optionalAdditionalCosts: [{ cost: 5, description: { fi: 'x' } }] } },
      ],
      ['a removed member price', { ...terms, costMember: undefined }],
      ['the payment time', { ...terms, paymentTime: 'confirmation' as const }],
      ['an early-bird rate added', { ...terms, cost: earlyBird }],
    ])('sees a change in %s', (_name, after) => {
      expect(paymentTermsDiffer(terms, after)).toBe(true)
    })

    it.each([
      ['moved', '2025-04-03T00:00:00.000+03:00'],
      ['removed', undefined],
    ])('sees the entry start %s as a change when an early-bird rate is set on either side', (_name, entryStartDate) => {
      const withEarlyBird = { ...terms, cost: earlyBird }
      expect(paymentTermsDiffer(withEarlyBird, { ...withEarlyBird, entryStartDate })).toBe(true)
      expect(paymentTermsDiffer({ ...terms, entryStartDate }, withEarlyBird)).toBe(true)
    })
  })

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
        'a trial that is not confirmed holds an overpaid fee as overpaid, its excess still returnable',
        { state: 'tentative' },
        { group: place, owner: { membership: true }, paidAmount: 40, paymentStatus: 'SUCCESS' },
        [],
        { canRefundExcess: true, excess: 5, status: 'overpaid' },
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
      ['only pending', {}, { group: place, paymentStatus: 'PENDING' }, false],
      ['paid before the amounts were kept', {}, { group: place, paymentStatus: 'SUCCESS' }, true],
      [
        'refunded less a handling fee (KOE-1526)',
        {},
        { group: place, paidAmount: 40, paymentStatus: 'SUCCESS', refundAmount: 35, refundHandlingCost: 5 },
        false,
      ],
      [
        'left with part of the payment after a refund (KOE-1526)',
        {},
        { group: place, paidAmount: 50, paymentStatus: 'SUCCESS', refundAmount: 35, refundHandlingCost: 5 },
        true,
      ],
    ])('reads paidForPlace for an entry that is %s', (_name, eventOverrides, registration, expected) => {
      expect(getPaymentPicture({ ...priced, ...eventOverrides }, { ...entry, ...registration }, []).paidForPlace).toBe(
        expected
      )
    })

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

  // KOE-1552: what the form says of the payment, read from the picture of the row it edits.
  describe('getFormPayment', () => {
    const shown = { ...eventWithStaticDates, cost: 40, costMember: 35 }
    const confirmed = { ...shown, state: 'confirmed' as const }
    const atConfirmation = { ...confirmed, paymentTime: 'confirmation' as const }
    const place = { key: '2026-08-15-ap', number: 1 }
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

    describe('due', () => {
      it('shows what is owed once the trial is confirmed', () => {
        expect(getFormPayment(confirmed, unpaid).due).toBe(40)
      })

      it('shows nothing owed before the trial is confirmed', () => {
        expect(getFormPayment({ ...shown, state: 'tentative' }, unpaid).due).toBe(0)
      })

      it('reads a paid place as the form has it, so a change shows at once (KOE-722)', () => {
        expect(getFormPayment(confirmed, { ...unpaid, paidAmount: 35 }).due).toBe(5)
      })

      // The participant's row carries the picture of the saved row; an edit before paying changes
      // what is owed, and the form shows the edited row's amount, not the saved one (KOE-722, KOE-1070).
      it("reads the edited row, not the saved row's picture, for a fee that did not go back", () => {
        const withOptional = {
          ...confirmed,
          cost: { normal: 40, optionalAdditionalCosts: [{ cost: 15, description: { fi: 'Ruoka' } }] },
        }
        const saved = { ...unpaid, payment: paymentPictureWith({ due: 40, standing: false, status: 'unpaid' }) }

        expect(getFormPayment(withOptional, { ...saved, optionalCosts: [0] }).due).toBe(55)
      })

      // For a fee that went back only the server knows the group; its due is taken as it is. Read
      // here, the same row would be a reserve's (no group), owing nothing.
      it.each([
        ['nothing for a reserve, as the server says', 0, 0],
        ['the fee again once it has a place, as the server says', 35, 35],
      ])('reads a fee that went back as %s', (_name, due, expected) => {
        const returned = { ...member, paidAmount: 35, payment: pictureOf(due), refundAmount: 35 }
        expect(getFormPayment(confirmed, returned).due).toBe(expected)
      })

      it('reads a returned fee itself when a response came without the picture', () => {
        expect(getFormPayment(confirmed, { ...member, paidAmount: 35, refundAmount: 35 }).due).toBe(0)
      })

      it('shows nothing owed for a returned fee before the trial is confirmed, whatever the picture says', () => {
        const returned = { ...member, paidAmount: 35, payment: pictureOf(35), refundAmount: 35 }
        expect(getFormPayment({ ...shown, state: 'tentative' }, returned).due).toBe(0)
      })
    })

    describe('waitsForPlace', () => {
      // The participant's row: no group, the picture decides.
      it.each<[string, Partial<PaymentPicture>, boolean]>([
        ['paying is offered', { canPay: true, status: 'unpaid' }, false],
        ['paying is not offered', { canPay: false, status: 'waitingForPlace' }, true],
        ['a free class (nothing owed yet)', { status: 'notCharged' }, true],
        ['a payment in progress', { status: 'inProgress' }, false],
        ['a payment charged twice', { status: 'duplicate' }, false],
      ])('on a row with no group, when %s', (_name, overrides, expected) => {
        expect(
          getFormPayment(atConfirmation, { ...unpaid, payment: paymentPictureWith(overrides) }).waitsForPlace
        ).toBe(expected)
      })

      it('never waits on a row with a picture when the trial is paid at entry', () => {
        const payment = paymentPictureWith({ canPay: false, status: 'unpaid' })
        expect(
          getFormPayment({ ...confirmed, paymentTime: 'registration' }, { ...unpaid, payment }).waitsForPlace
        ).toBe(false)
      })

      // The secretary's row, with its group, and a new entry: the group decides.
      it.each([
        ['a row in a place', { group: place }, false],
        ['a row on the reserve list', { group: { key: 'reserve', number: 1 } }, true],
        ['a new entry, with neither group nor picture', {}, true],
        ['a payment charged twice', { paymentStatus: 'DUPLICATE' as const }, false],
      ])('reads %s by the group', (_name, registration, expected) => {
        expect(getFormPayment(atConfirmation, { ...unpaid, ...registration }).waitsForPlace).toBe(expected)
      })

      it('never waits when the trial is paid at entry', () => {
        expect(getFormPayment({ ...confirmed, paymentTime: 'registration' }, unpaid).waitsForPlace).toBe(false)
      })

      // Nothing owed waits for nothing, whatever the caller does with the amount.
      it.each([
        [
          'a place in a trial that is not confirmed',
          { ...atConfirmation, state: 'tentative' as const },
          { group: place },
        ],
        ['a paid place', atConfirmation, { group: place, paidAmount: 40, paymentStatus: 'SUCCESS' as const }],
        [
          'a reserve in a trial that is not confirmed',
          { ...atConfirmation, state: 'tentative' as const },
          { group: { key: 'reserve', number: 1 } },
        ],
      ])('does not wait for %s', (_name, event, registration) => {
        expect(getFormPayment(event, { ...unpaid, ...registration })).toEqual({ due: 0, waitsForPlace: false })
      })
    })
  })

  // KOE-1526 review: the secretary's request is the pay offer read from a row without transactions.
  describe('canPay on the secretary row', () => {
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
      expect(getPaymentPicture(event, { ...owing, ...overrides }, []).canPay).toBe(expected)
    })

    it('asks nothing for a trial that is not confirmed', () => {
      expect(getPaymentPicture({ ...event, state: 'cancelled' }, owing, []).canPay).toBe(false)
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
    const event = { cost: 40, costMember: 35, entryStartDate: new Date('2026-01-01'), state: 'confirmed' as const }
    const member: MinimalRegistrationForCost = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' },
      owner: { membership: true },
      ownerHandles: true,
    }
    const pictureOf = (registration: Parameters<typeof getPaymentPicture>[1]) =>
      getPaymentPicture(event, registration, [])

    describe('the overpaid part to return', () => {
      it('lets a participant who paid the full price as a member have the difference back (KOE-1382)', () => {
        expect(pictureOf({ ...member, paidAmount: 40 }).canRefundExcess).toBe(true)
      })

      it('has nothing to return once the difference has been refunded', () => {
        expect(pictureOf({ ...member, paidAmount: 40, refundAmount: 5 }).canRefundExcess).toBe(false)
      })

      it('has nothing to return when the member price was paid', () => {
        expect(pictureOf({ ...member, paidAmount: 35 }).canRefundExcess).toBe(false)
      })

      it('leaves a cancelled entry to the ordinary refund', () => {
        expect(pictureOf({ ...member, cancelled: true, paidAmount: 40 }).canRefundExcess).toBe(false)
      })

      // The overpaid part is the entrant's in a cancelled trial too (KOE-1552).
      it.each(['cancelled', 'tentative'] as const)('returns the overpaid part in a %s trial', (state) => {
        expect(getPaymentPicture({ ...event, state }, { ...member, paidAmount: 40 }, []).canRefundExcess).toBe(true)
      })
    })

    describe('unsettled', () => {
      const paidAt = new Date('2026-01-03')

      it('is unsettled when a part is missing or paid over', () => {
        expect(pictureOf({ ...member, paidAmount: 40, paidAt }).unsettled).toBe(true)
        expect(pictureOf({ ...member, owner: { membership: false }, paidAmount: 35, paidAt }).unsettled).toBe(true)
      })

      it('is settled when the fee has been paid as it reads', () => {
        expect(pictureOf({ ...member, paidAmount: 35, paidAt }).unsettled).toBe(false)
      })

      it('is not unsettled, only unpaid, when nothing has been paid', () => {
        expect(pictureOf(member).unsettled).toBe(false)
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
        expect(pictureOf(refundedReserve).unsettled).toBe(false)
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
        expect(pictureOf(repaid).unsettled).toBe(false)
        expect(pictureOf(repaid).canRefundExcess).toBe(false)
      })

      it('is unsettled when that reserve is lifted into a place (KOE-1526)', () => {
        const place = { key: '2026-08-15-ap', number: 1 }
        expect(pictureOf({ ...refundedReserve, group: place }).unsettled).toBe(true)
      })
    })
  })
})
