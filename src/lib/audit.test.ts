import type { AuditMessage } from './audit'
import i18next from 'i18next'
import { i18nInitOptions } from '../i18n/config'
import {
  auditUser,
  duplicatePaymentAudit,
  duplicatePaymentOfOtherAudit,
  emailBlockedAudit,
  emailDeliveryFailedAudit,
  emailFailedAudit,
  emailSentAudit,
  emailSubjectAuditKey,
  eventCopiedFromAudit,
  eventCopiedToAudit,
  formatGroupAuditInfo,
  groupChangeAudit,
  internalNotesChangedAudit,
  invitationAwaitingPaymentAudit,
  paymentAudit,
  refundPaytrailFailedAudit,
  registrationAddedAudit,
  registrationCancelledAudit,
  registrationConfirmedAudit,
  registrationCreatedAudit,
  registrationDaysMismatchAudit,
  resultSavedAudit,
  startNumberPublishedAudit,
  startNumberReleasedAudit,
  startNumberSavedAudit,
  startNumbersEnteredAudit,
  startNumbersPublishedAudit,
} from './audit'

describe('auditUser', () => {
  it('names an authenticated user without a source', () => {
    expect(auditUser({ name: 'Test User' })).toEqual({ user: 'Test User' })
  })

  it('carries the source of a name taken from the registration', () => {
    expect(auditUser({ name: 'Payer Name', source: 'registration' })).toEqual({
      user: 'Payer Name',
      userSource: 'registration',
    })
  })
})

describe('formatGroupAuditInfo', () => {
  it('names the lists and a day group in Finnish', () => {
    expect(formatGroupAuditInfo(undefined)).toBe('')
    expect(formatGroupAuditInfo({ key: 'cancelled', number: 5 })).toBe('Peruneet #5')
    expect(formatGroupAuditInfo({ key: 'reserve', number: 1 })).toBe('Ilmoittautuneet #1')
    expect(
      formatGroupAuditInfo({ date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 20, time: 'ip' })
    ).toBe('la 3.8. ip #20')
  })
})

describe('groupChangeAudit', () => {
  const dayGroup = { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 2, time: 'ip' as const }

  it('gives a move its groups as parts and its reason as a key (KOE-1442)', () => {
    expect(groupChangeAudit(dayGroup, { key: 'reserve', number: 1 }, 'move')).toEqual({
      message: 'Ryhmä: la 3.8. ip #2 -> Ilmoittautuneet #1 siirto',
      messageKey: 'audit.messages.groupChanged',
      messageParams: {
        fromDate: '2024-08-03',
        fromNumber: 2,
        fromTimeKey: 'registration.time.ip',
        reason: 'siirto',
        reasonKey: 'audit.groupReason.move',
        toGroupKey: 'eventManagement.participantSelection.registered',
        toNumber: 1,
      },
    })
  })

  it('names the first placement without a previous group', () => {
    expect(groupChangeAudit(undefined, { key: 'cancelled', number: 3 }, 'automatic')).toEqual({
      message: 'Ryhmä: Peruneet #3 (automaattinen sijoitus)',
      messageKey: 'audit.messages.groupSet',
      messageParams: {
        reason: '(automaattinen sijoitus)',
        reasonKey: 'audit.groupReason.automatic',
        toGroupKey: 'eventManagement.participantSelection.cancelled',
        toNumber: 3,
      },
    })
  })

  it('leaves out what a group does not have', () => {
    expect(groupChangeAudit(undefined, { key: 'kp', number: 4 })).toEqual({
      message: 'Ryhmä:  #4',
      messageKey: 'audit.messages.groupSet',
      messageParams: { toNumber: 4 },
    })
  })

  it('writes only the Finnish line when the registration has no group', () => {
    expect(groupChangeAudit({ key: 'reserve', number: 1 }, undefined, 'consequence')).toEqual({
      message: 'Ryhmä: Ilmoittautuneet #1 ->  seuraus',
    })
  })
})

describe('startNumberSavedAudit', () => {
  it.each([
    [4, undefined, 'audit.messages.startNumberSaved', 'Starttinumero tallennettu: 4', { number: 4 }],
    [4, 4, 'audit.messages.startNumberSaved', 'Starttinumero tallennettu: 4', { number: 4 }],
    [13, 9, 'audit.messages.startNumberChanged', 'Starttinumero tallennettu: 9 -> 13', { number: 13, previous: 9 }],
  ])('saves %s over %s as %s', (number, previous, messageKey, message, messageParams) => {
    expect(startNumberSavedAudit(number, previous)).toEqual({ message, messageKey, messageParams })
  })
})

describe('startNumbersPublishedAudit', () => {
  it.each([
    [true, '', 'audit.messages.startNumbersPublished', 'Starttinumerot julkaistu', undefined],
    [false, '', 'audit.messages.startNumbersHidden', 'Starttinumerot piilotettu', undefined],
    [true, 'ALO', 'audit.messages.startNumbersPublishedScope', 'Starttinumerot julkaistu (ALO)', { scope: 'ALO' }],
    [false, 'ALO', 'audit.messages.startNumbersHiddenScope', 'Starttinumerot piilotettu (ALO)', { scope: 'ALO' }],
  ])('published %s in %j', (published, scope, messageKey, message, messageParams) => {
    expect(startNumbersPublishedAudit(published, scope)).toEqual({
      message,
      messageKey,
      ...(messageParams ? { messageParams } : {}),
    })
  })
})

describe('emailDeliveryFailedAudit', () => {
  it('keeps the template and the reason as details', () => {
    expect(
      emailDeliveryFailedAudit({ email: 'a@example.com', reason: 'abuse', status: 'complaint', template: 'picked' })
    ).toEqual({
      details: [
        {
          detailKey: 'audit.details.emailTemplate',
          detailParams: { template: 'picked', templateKey: 'emailTemplate.picked' },
        },
        { detailKey: 'audit.details.deliveryReason', detailParams: { reason: 'abuse' } },
      ],
      message:
        'Sähköpostin toimitus epäonnistui (merkittiin roskapostiksi): a@example.com, template: picked, reason: abuse',
      messageKey: 'audit.messages.emailDeliveryFailed',
      messageParams: {
        email: 'a@example.com',
        status: 'merkittiin roskapostiksi',
        statusKey: 'audit.deliveryStatus.complaint',
      },
    })
  })

  it('has no details without a template or a reason', () => {
    expect(emailDeliveryFailedAudit({ email: 'a@example.com', status: 'bounce' })).not.toHaveProperty('details')
  })
})

describe('emailSubjectAuditKey', () => {
  it('names a registration email by its subject for the context', () => {
    expect(emailSubjectAuditKey('')).toBe('registration.email.subject')
    expect(emailSubjectAuditKey()).toBe('registration.email.subject')
    expect(emailSubjectAuditKey('cancel')).toBe('registration.email.subject_cancel')
  })
})

describe('resultSavedAudit', () => {
  it.each([
    [false, '', 'audit.messages.resultSaved', 'Tallensi tuloksen'],
    [true, '', 'audit.messages.resultChanged', 'Muutti tulosta'],
  ])('changed %s without a result text', (changed, result, messageKey, message) => {
    expect(resultSavedAudit(changed, result)).toEqual({ message, messageKey })
  })

  it.each([
    [false, 'audit.messages.resultSavedDetail', 'Tallensi tuloksen: HYV, 20 p'],
    [true, 'audit.messages.resultChangedDetail', 'Muutti tulosta: HYV, 20 p'],
  ])('changed %s with a result text', (changed, messageKey, message) => {
    expect(resultSavedAudit(changed, 'HYV, 20 p')).toEqual({
      message,
      messageKey,
      messageParams: { result: 'HYV, 20 p' },
    })
  })
})

/**
 * Every message, built as a lambda builds it. The Finnish translation of its key, given the stored
 * parameters, has to read exactly as the stored `message`: a Finnish trail looks as it did before
 * the keys, and the two never drift apart (KOE-1442).
 */
const messages: Array<[string, AuditMessage]> = [
  ['startNumberPublished', startNumberPublishedAudit(1)],
  ['startNumberReleased', startNumberReleasedAudit(2)],
  ['startNumberSaved', startNumberSavedAudit(3)],
  ['startNumberChanged', startNumberSavedAudit(3, 2)],
  ['startNumbersPublished', startNumbersPublishedAudit(true, '')],
  ['startNumbersHiddenScope', startNumbersPublishedAudit(false, 'ALO, 12.9.2026, ap')],
  ['startNumbersEntered', startNumbersEnteredAudit(5)],
  ['startNumbersEnteredClass', startNumbersEnteredAudit(1, 'AVO')],
  ['emailSentTo', emailSentAudit('Koekutsu', 'emailTemplate.invitation', ['a@example.com', 'b@example.com'])],
  ['emailFailedTo', emailFailedAudit('Koekutsu', 'emailTemplate.invitation', ['a@example.com'])],
  ['emailBlocked', emailBlockedAudit(4)],
  ['emailDeliveryFailed', emailDeliveryFailedAudit({ email: 'a@example.com', status: 'bounce' })],
  ['registrationCreated', registrationCreatedAudit()],
  ['registrationAdded', registrationAddedAudit()],
  ['registrationConfirmed', registrationConfirmedAudit()],
  ['registrationCancelled', registrationCancelledAudit('Koiran juoksut', 'registration.cancelReason.dog-heat')],
  ['registrationCancelled (own words)', registrationCancelledAudit('auto hajosi')],
  ['registrationDaysOutsideEvent', registrationDaysMismatchAudit('1.1.2030')],
  ['registrationDaysOutsideClass', registrationDaysMismatchAudit('1.1.2030, 2.1.2030', 'ALO')],
  ['invitationAwaitingPayment', invitationAwaitingPaymentAudit()],
  ['internalNotesChanged', internalNotesChangedAudit()],
  ['payment', paymentAudit('payment', 'Nordea', '19,00 €')],
  ['paymentFailed', paymentAudit('paymentFailed', 'Nordea', '19,00 €')],
  ['refund', paymentAudit('refund', 'Nordea', '19,00 €')],
  ['refundFailed', paymentAudit('refundFailed', 'Nordea', '19,00 €')],
  ['refundPending', paymentAudit('refundPending', 'Nordea', '19,00 €')],
  ['paymentDuplicate', duplicatePaymentAudit('Nordea', '19,00 €', 'reg-2')],
  ['paymentDuplicateOther', duplicatePaymentOfOtherAudit('Nordea', '19,00 €', 'reg-1')],
  [
    'refundPaytrailFailed',
    refundPaytrailFailedAudit('Maksun palautus epäonnistui Paytrailissa (400): Revert failed', 400, 'Revert failed'),
  ],
  ['resultSaved', resultSavedAudit(false, '')],
  ['resultChangedDetail', resultSavedAudit(true, 'HYV, 20/30 p')],
  ['eventCopiedTo', eventCopiedToAudit('test', 'copy-1')],
  ['eventCopiedFrom', eventCopiedFromAudit('prod', 'source-1')],
]

describe('the Finnish translation of each audit message', () => {
  const i18n = i18next.createInstance()

  beforeAll(async () => {
    await i18n.init({ ...i18nInitOptions(), debug: false, lng: 'fi' })
  })

  it.each(messages)('%s reads as its stored message', (_name, { message, messageKey, messageParams }) => {
    const finnish = i18n.getResource('fi', 'translation', messageKey ?? '')
    expect(finnish).toEqual(expect.any(String))
    expect(i18n.services.interpolator.interpolate(finnish, { ...messageParams }, 'fi', {})).toBe(message)
  })

  // Not `exists`, which would find the Finnish fallback.
  it.each(messages)('%s has an English translation', (_name, { messageKey }) => {
    expect(i18n.getResource('en', 'translation', messageKey ?? '')).toEqual(expect.any(String))
  })
})
