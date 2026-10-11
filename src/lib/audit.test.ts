import type { AuditMessage } from './audit'
import i18next from 'i18next'
import { i18nInitOptions } from '../i18n/config'
import { registerFormatters } from '../i18n/formatters'
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
  formatAuditDetail,
  formatAuditMessage,
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
import { parseDateOnlyString } from './utils'

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
        fromTime: 'ip',
        fromTimeKey: 'audit.time.ip',
        reason: 'siirto',
        reasonKey: 'audit.groupReason.move',
        toGroup: 'Ilmoittautuneet',
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
        toGroup: 'Peruneet',
        toGroupKey: 'eventManagement.participantSelection.cancelled',
        toNumber: 3,
      },
    })
  })

  it('leaves out what a group does not have', () => {
    expect(groupChangeAudit(undefined, { key: 'kp', number: 4 })).toEqual({
      message: 'Ryhmä: #4',
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
    [true, {}, 'audit.messages.startNumbersPublished', 'Starttinumerot julkaistu', undefined],
    [false, {}, 'audit.messages.startNumbersHidden', 'Starttinumerot piilotettu', undefined],
    [
      true,
      { eventClass: 'ALO' },
      'audit.messages.classStartNumbersPublished',
      'ALO starttinumerot julkaistu',
      { eventClass: 'ALO' },
    ],
    [
      false,
      { date: '2026-09-12' },
      'audit.messages.startNumbersHiddenDay',
      'Starttinumerot piilotettu la 12.9.',
      { date: '2026-09-12' },
    ],
    [
      true,
      { date: '2026-09-12', eventClass: 'ALO', time: 'ap' },
      'audit.messages.classStartNumbersPublishedDay',
      'ALO starttinumerot julkaistu la 12.9. ap',
      { date: '2026-09-12', eventClass: 'ALO', time: 'ap', timeKey: 'audit.time.ap' },
    ],
    [
      false,
      { date: '2026-09-12', eventClass: 'ALO' },
      'audit.messages.classStartNumbersHiddenDay',
      'ALO starttinumerot piilotettu la 12.9.',
      { date: '2026-09-12', eventClass: 'ALO' },
    ],
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
 * Every message, built as a lambda builds it. Read back in Finnish it has to say exactly what its
 * stored `message` says: a Finnish trail looks as it did before the keys, and the two never drift
 * apart (KOE-1442).
 */
const dayGroup = { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 2, time: 'ip' as const }
const kpGroup = { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-kp', number: 4, time: 'kp' as const }

const messages: Array<[string, AuditMessage]> = [
  ['startNumberPublished', startNumberPublishedAudit(1)],
  ['startNumberReleased', startNumberReleasedAudit(2)],
  ['startNumberSaved', startNumberSavedAudit(3)],
  ['startNumberChanged', startNumberSavedAudit(3, 2)],
  ['startNumbersPublished', startNumbersPublishedAudit(true)],
  ['classStartNumbersPublished', startNumbersPublishedAudit(true, { eventClass: 'ALO' })],
  ['startNumbersHiddenDay', startNumbersPublishedAudit(false, { date: '2026-09-12' })],
  [
    'classStartNumbersPublishedDay',
    startNumbersPublishedAudit(true, { date: '2026-09-12', eventClass: 'ALO', time: 'ip' }),
  ],
  ['startNumbersEntered', startNumbersEnteredAudit(5)],
  ['startNumbersEntered (one)', startNumbersEnteredAudit(1)],
  ['startNumbersEnteredClass', startNumbersEnteredAudit(1, 'AVO')],
  ['emailSentTo', emailSentAudit('Koekutsu', 'emailTemplate.invitation', ['a@example.com', 'b@example.com'])],
  ['emailFailedTo', emailFailedAudit('Koekutsu', 'emailTemplate.invitation', ['a@example.com'])],
  ['emailBlocked', emailBlockedAudit(4)],
  ['emailBlocked (one)', emailBlockedAudit(1)],
  ['emailDeliveryFailed', emailDeliveryFailedAudit({ email: 'a@example.com', status: 'bounce' })],
  ['emailDeliveryFailed (complaint)', emailDeliveryFailedAudit({ email: 'a@example.com', status: 'complaint' })],
  ['groupChanged', groupChangeAudit(dayGroup, { key: 'reserve', number: 1 }, 'move')],
  ['groupChanged (consequence)', groupChangeAudit(dayGroup, { ...dayGroup, number: 1 }, 'consequence')],
  ['groupChanged (no reason)', groupChangeAudit(kpGroup, { key: 'cancelled', number: 5 })],
  ['groupSet', groupChangeAudit(undefined, { key: 'reserve', number: 2 }, 'automatic')],
  ['groupSet (kp, no day)', groupChangeAudit(undefined, { key: 'kp', number: 4 })],
  ['registrationCreated', registrationCreatedAudit()],
  ['registrationAdded', registrationAddedAudit()],
  ['registrationConfirmed', registrationConfirmedAudit()],
  ['registrationCancelled', registrationCancelledAudit('Koiran juoksut', 'registration.cancelReason.dog-heat')],
  ['registrationCancelled (own words)', registrationCancelledAudit('auto hajosi')],
  ['registrationCancelled (no reason)', registrationCancelledAudit()],
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

const i18n = i18next.createInstance()
const fi = () => i18n.getFixedT('fi')
const en = () => i18n.getFixedT('en')

beforeAll(async () => {
  await i18n.init({ ...i18nInitOptions(), debug: false, lng: 'fi' })
  registerFormatters(i18n)
})

describe('the Finnish reading of each audit message', () => {
  it.each(messages)('%s reads as its stored message', (_name, row) => {
    expect(row.messageKey).toEqual(expect.any(String))
    expect(formatAuditMessage(fi(), row)).toBe(row.message)
  })

  // Not `exists`, which would find the Finnish fallback.
  it.each(messages)('%s has an English translation', (_name, { messageKey }) => {
    expect(i18n.getResource('en', 'translation', messageKey ?? '')).toEqual(expect.any(String))
  })

  // A translated part keeps its Finnish text beside the key, for a reader without the key; the two
  // must say the same, or the stored message and the Finnish reading would part ways.
  it.each(messages)("%s stores each translated part's Finnish text", (_name, { messageParams = {} }) => {
    for (const [name, value] of Object.entries(messageParams)) {
      if (!name.endsWith('Key') || typeof value !== 'string') continue
      expect(i18n.getResource('fi', 'translation', value)).toBe(messageParams[name.slice(0, -'Key'.length)])
    }
  })
})

describe('formatAuditMessage in English', () => {
  it.each([
    [groupChangeAudit(dayGroup, { key: 'reserve', number: 1 }, 'move'), 'Group: Sat 3.8. pm #2 -> Registered #1 move'],
    [groupChangeAudit(kpGroup, { key: 'cancelled', number: 5 }), 'Group: Sat 3.8. #4 -> Cancelled #5'],
    [groupChangeAudit(undefined, { key: 'kp', number: 4 }), 'Group: #4'],
    [startNumbersEnteredAudit(1, 'ALO'), 'Start number entered for 1 dog (ALO)'],
    [startNumbersEnteredAudit(3), 'Start numbers entered for 3 dogs'],
    [emailBlockedAudit(1), 'Message blocked in the test environment (1 recipient)'],
    [registrationCancelledAudit(), 'Registration cancelled, reason: (not filled in)'],
    [
      startNumbersPublishedAudit(true, { date: '2026-09-12', eventClass: 'ALO', time: 'ap' }),
      'ALO start numbers published Sat 12.9. am',
    ],
    [
      emailDeliveryFailedAudit({ email: 'a@example.com', status: 'bounce' }),
      'Email delivery failed (bounced): a@example.com',
    ],
  ])('%j reads %j', (row, english) => {
    expect(formatAuditMessage(en(), row)).toBe(english)
  })

  it('reads a day the API revived into a Date as the day it was (KOE-1442)', () => {
    const row = groupChangeAudit(dayGroup, { key: 'reserve', number: 1 }, 'move')
    const revived = { ...row, messageParams: { ...row.messageParams, fromDate: parseDateOnlyString('2024-08-03') } }

    expect(formatAuditMessage(en(), revived)).toBe('Group: Sat 3.8. pm #2 -> Registered #1 move')
    expect(formatAuditMessage(fi(), revived)).toBe(row.message)
  })

  it('shows a free text the API revived into a Date as the text it was', () => {
    const row = registrationCancelledAudit('2026-10-18')

    expect(formatAuditMessage(en(), { ...row, messageParams: { reason: parseDateOnlyString('2026-10-18') } })).toBe(
      'Registration cancelled, reason: 2026-10-18'
    )
  })

  it('shows the stored text for a key outside the audit translations, and for one this bundle lacks', () => {
    expect(formatAuditMessage(en(), { message: 'Tallennettu', messageKey: 'x.y' })).toBe('Tallennettu')
    expect(formatAuditMessage(en(), { message: 'Tallennettu' })).toBe('Tallennettu')
    expect(formatAuditMessage(en(), { message: 'Tallennettu', messageKey: 'audit.messages.notYet' })).toBe(
      'Tallennettu'
    )
  })

  it('falls back to the stored part when its key is missing', () => {
    expect(
      formatAuditMessage(en(), {
        ...emailSentAudit('Oma aihe', 'registration.email.subject_refund', ['a@example.com']),
      })
    ).toBe('Email: Oma aihe, to: a@example.com')
  })
})

describe('formatAuditDetail', () => {
  it('translates a detail and the parts it names', () => {
    const [template, reason] =
      emailDeliveryFailedAudit({ email: 'a@example.com', reason: 'abuse', status: 'complaint', template: 'picked' })
        .details ?? []

    expect(formatAuditDetail(en(), template)).toBe('Template: Picked notification')
    expect(formatAuditDetail(en(), reason)).toBe('Reason: abuse')
    expect(formatAuditDetail(en(), { detailKey: 'nope' })).toBe('')
  })
})
