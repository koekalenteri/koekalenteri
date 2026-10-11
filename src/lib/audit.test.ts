import type { AuditRecord } from '../types'
import type { AuditMessage } from './audit'
import i18next from 'i18next'
import { i18nInitOptions } from '../i18n/config'
import { registerFormatters } from '../i18n/formatters'
import {
  auditLabelParams,
  auditUser,
  duplicatePaymentAudit,
  duplicatePaymentOfOtherAudit,
  emailBlockedAudit,
  emailDeliveryFailedAudit,
  emailFailedAudit,
  emailSentAudit,
  emailSubjectAuditKey,
  emailsSentAudit,
  eventChangedAudit,
  eventCopiedFromAudit,
  eventCopiedToAudit,
  eventCreatedAudit,
  eventDeletedAudit,
  eventSavedAudit,
  formatAuditDetail,
  formatAuditMessage,
  groupChangeAudit,
  internalNotesChangedAudit,
  invitationAwaitingPaymentAudit,
  mergeAuditTrail,
  paymentAudit,
  refundPaytrailFailedAudit,
  registrationAddedAudit,
  registrationCancelledAudit,
  registrationConfirmedAudit,
  registrationCreatedAudit,
  registrationDaysMismatchAudit,
  resultSavedAudit,
  startListAudit,
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

describe('mergeAuditTrail', () => {
  const record = (timestamp: string, messageKey: string): AuditRecord => ({
    auditKey: 'event:event-1',
    messageKey,
    timestamp: new Date(timestamp),
    user: 'admin',
  })

  it('merges, orders, and deduplicates audit records', () => {
    const newer = record('2026-07-14T12:01:00.000Z', 'audit.messages.eventSaved')
    const older = record('2026-07-14T12:00:00.000Z', 'audit.messages.eventCreated')

    expect(mergeAuditTrail([newer], [older, newer])).toEqual([newer, older])
  })
})

describe('groupChangeAudit', () => {
  const dayGroup = { date: '2024-08-02T21:00:00.000Z', key: '2024-08-02-ip', number: 2, time: 'ip' as const }

  it('gives a move its groups as parts and its reason as a key, and no text of its own (KOE-1511)', () => {
    expect(groupChangeAudit(dayGroup, { key: 'reserve', number: 1 }, 'move')).toEqual({
      messageKey: 'audit.messages.groupChanged',
      messageParams: {
        fromDate: '2024-08-03',
        fromNumber: 2,
        fromTimeKey: 'audit.time.ip',
        reasonKey: 'audit.groupReason.move',
        toGroupKey: 'eventManagement.participantSelection.registered',
        toNumber: 1,
      },
    })
  })

  it('names the first placement without a previous group', () => {
    expect(groupChangeAudit(undefined, { key: 'cancelled', number: 3 }, 'automatic')).toEqual({
      messageKey: 'audit.messages.groupSet',
      messageParams: {
        reasonKey: 'audit.groupReason.automatic',
        toGroupKey: 'eventManagement.participantSelection.cancelled',
        toNumber: 3,
      },
    })
  })

  it('leaves out what a group does not have', () => {
    expect(groupChangeAudit(undefined, { key: 'kp', number: 4 })).toEqual({
      messageKey: 'audit.messages.groupSet',
      messageParams: { toNumber: 4 },
    })
  })

  // A cancellation's reason edited on a dog that never stood in a group: no group to name (KOE-1511).
  it('writes no row when neither side has a group', () => {
    expect(groupChangeAudit(undefined, undefined, 'move')).toBeUndefined()
  })

  it('names a registration left without a group by the group it had', () => {
    expect(groupChangeAudit({ key: 'reserve', number: 1 }, undefined, 'consequence')).toEqual({
      messageKey: 'audit.messages.groupRemoved',
      messageParams: {
        fromGroupKey: 'eventManagement.participantSelection.registered',
        fromNumber: 1,
        reasonKey: 'audit.groupReason.consequence',
      },
    })
  })
})

describe('startNumberSavedAudit', () => {
  it.each([
    [4, undefined, 'audit.messages.startNumberSaved', { number: 4 }],
    [4, 4, 'audit.messages.startNumberSaved', { number: 4 }],
    [13, 9, 'audit.messages.startNumberChanged', { number: 13, previous: 9 }],
  ])('saves %s over %s as %s', (number, previous, messageKey, messageParams) => {
    expect(startNumberSavedAudit(number, previous)).toEqual({ messageKey, messageParams })
  })
})

describe('startNumbersPublishedAudit', () => {
  it.each([
    [true, {}, 'audit.messages.startNumbersPublished', undefined],
    [false, {}, 'audit.messages.startNumbersHidden', undefined],
    [true, { eventClass: 'ALO' }, 'audit.messages.classStartNumbersPublished', { eventClass: 'ALO' }],
    [false, { date: '2026-09-12' }, 'audit.messages.startNumbersHiddenDay', { date: '2026-09-12' }],
    [
      true,
      { date: '2026-09-12', eventClass: 'ALO', time: 'ap' },
      'audit.messages.classStartNumbersPublishedDay',
      { date: '2026-09-12', eventClass: 'ALO', timeKey: 'audit.time.ap' },
    ],
    [
      false,
      { date: '2026-09-12', eventClass: 'ALO' },
      'audit.messages.classStartNumbersHiddenDay',
      { date: '2026-09-12', eventClass: 'ALO' },
    ],
  ])('published %s in %j', (published, scope, messageKey, messageParams) => {
    expect(startNumbersPublishedAudit(published, scope)).toEqual({
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
      messageKey: 'audit.messages.emailDeliveryFailed',
      messageParams: { email: 'a@example.com', statusKey: 'audit.deliveryStatus.complaint' },
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

describe('registrationCancelledAudit', () => {
  it.each([
    ['a predefined reason by its key', 'dog-heat', { reasonKey: 'registration.cancelReason.dog-heat' }],
    ["the entrant's own words as written", 'auto hajosi', { reason: 'auto hajosi' }],
    ['a missing reason by its key', undefined, { reasonKey: 'audit.reasonMissing' }],
  ])('names %s', (_case, cancelReason, messageParams) => {
    expect(registrationCancelledAudit(cancelReason)).toEqual({
      messageKey: 'audit.messages.registrationCancelled',
      messageParams,
    })
  })
})

describe('refundPaytrailFailedAudit', () => {
  it("keeps Paytrail's own words, or names a missing one by a key", () => {
    expect(refundPaytrailFailedAudit(400, 'Revert failed')).toEqual({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { error: 'Revert failed', status: 400 },
    })
    expect(refundPaytrailFailedAudit(500)).toEqual({
      messageKey: 'audit.messages.refundPaytrailFailed',
      messageParams: { errorKey: 'audit.unknownError', status: 500 },
    })
  })
})

describe('resultSavedAudit', () => {
  it.each([
    [false, 'audit.messages.resultSaved'],
    [true, 'audit.messages.resultChanged'],
  ])('changed %s without a result text', (changed, messageKey) => {
    expect(resultSavedAudit(changed, '')).toEqual({ messageKey })
  })

  it.each([
    [false, 'audit.messages.resultSavedDetail'],
    [true, 'audit.messages.resultChangedDetail'],
  ])('changed %s with a result text', (changed, messageKey) => {
    expect(resultSavedAudit(changed, 'HYV, 20 p')).toEqual({ messageKey, messageParams: { result: 'HYV, 20 p' } })
  })
})

/** Every message, built as a lambda builds it. */
const groupRow = (...args: Parameters<typeof groupChangeAudit>): AuditMessage => {
  const row = groupChangeAudit(...args)
  if (!row) throw new Error('the change names no group')
  return row
}

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
  ['startNumbersPublishedDay', startNumbersPublishedAudit(true, { date: '2026-09-12', time: 'kp' })],
  ['startNumbersHidden', startNumbersPublishedAudit(false)],
  ['classStartNumbersHidden', startNumbersPublishedAudit(false, { eventClass: 'ALO' })],
  ['classStartNumbersHiddenDay', startNumbersPublishedAudit(false, { date: '2026-09-12', eventClass: 'ALO' })],
  [
    'classStartNumbersPublishedDay',
    startNumbersPublishedAudit(true, { date: '2026-09-12', eventClass: 'ALO', time: 'ip' }),
  ],
  ['startNumbersEntered', startNumbersEnteredAudit(5)],
  ['startNumbersEntered (one)', startNumbersEnteredAudit(1)],
  ['startNumbersEnteredClass', startNumbersEnteredAudit(1, 'AVO')],
  ['emailSentTo', emailSentAudit('emailTemplate.invitation', ['a@example.com', 'b@example.com'])],
  ['emailFailedTo', emailFailedAudit('emailTemplate.invitation', ['a@example.com'])],
  ['emailBlocked', emailBlockedAudit(4)],
  ['emailBlocked (one)', emailBlockedAudit(1)],
  ['emailDeliveryFailed', emailDeliveryFailedAudit({ email: 'a@example.com', status: 'bounce' })],
  ['emailDeliveryFailed (complaint)', emailDeliveryFailedAudit({ email: 'a@example.com', status: 'complaint' })],
  ['groupChanged', groupRow(dayGroup, { key: 'reserve', number: 1 }, 'move')],
  ['groupChanged (consequence)', groupRow(dayGroup, { ...dayGroup, number: 1 }, 'consequence')],
  ['groupChanged (no reason)', groupRow(kpGroup, { key: 'cancelled', number: 5 })],
  ['groupSet', groupRow(undefined, { key: 'reserve', number: 2 }, 'automatic')],
  ['groupRemoved', groupRow({ key: 'cancelled', number: 2 }, undefined, 'consequence')],
  ['registrationCreated', registrationCreatedAudit()],
  ['registrationAdded', registrationAddedAudit()],
  ['registrationConfirmed', registrationConfirmedAudit()],
  ['registrationCancelled', registrationCancelledAudit('dog-heat')],
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
  ['refundPaytrailFailed', refundPaytrailFailedAudit(400, 'Revert failed')],
  ['refundPaytrailFailed (no error)', refundPaytrailFailedAudit(500)],
  ['resultSaved', resultSavedAudit(false, '')],
  ['resultChangedDetail', resultSavedAudit(true, 'HYV, 20/30 p')],
  ['eventCopiedTo', eventCopiedToAudit('test', 'copy-1')],
  ['eventCopiedFrom', eventCopiedFromAudit('prod', 'source-1')],
  ['eventCreated', eventCreatedAudit()],
  ['eventDeleted', eventDeletedAudit()],
  ['eventSaved', eventSavedAudit()],
  ['changed', eventChangedAudit([{ field: 'name', next: { text: 'b' }, previous: { text: 'a' } }])],
  ['startListPublished', startListAudit(true)],
  ['startListHidden', startListAudit(false)],
  ['classStartListPublished', startListAudit(true, 'ALO')],
  ['classStartListHidden', startListAudit(false, 'ALO')],
  ['emailSent', emailsSentAudit({ failed: [], ok: ['a@example.com'], registrations: [], template: 'picked' })],
  [
    'classEmailSent',
    emailsSentAudit({
      failed: ['b@example.com'],
      ok: ['a@example.com'],
      registrations: [{ class: 'ALO' }, { class: 'ALO' }],
      template: 'invitation',
    }),
  ],
]

const i18n = i18next.createInstance()
const fi = () => i18n.getFixedT('fi')
const en = () => i18n.getFixedT('en')

beforeAll(async () => {
  await i18n.init({ ...i18nInitOptions(), debug: false, lng: 'fi' })
  registerFormatters(i18n)
})

describe('each audit message', () => {
  it.each(messages)('%s stores a key and no text of its own (KOE-1511)', (_name, row) => {
    expect(row.messageKey).toEqual(expect.any(String))
    expect(row).not.toHaveProperty('message')
  })

  // Not `exists`, which would find the Finnish fallback for English.
  it.each(messages)('%s names keys that both languages have', (_name, { messageKey, messageParams = {} }) => {
    const keys = [
      messageKey,
      ...Object.entries(messageParams)
        .filter(([name]) => name.endsWith('Key'))
        .map(([, value]) => value),
    ]
    for (const key of keys) {
      expect(i18n.getResource('fi', 'translation', String(key))).toEqual(expect.any(String))
      expect(i18n.getResource('en', 'translation', String(key))).toEqual(expect.any(String))
    }
  })

  // The keys exist; the parameters must also be the ones each translation names, or i18next leaves
  // the placeholder in the text.
  it.each(messages)('%s fills every placeholder in both languages', (_name, row) => {
    for (const t of [fi(), en()]) {
      const text = formatAuditMessage(t, row)
      expect(text).not.toMatch(/\{\{|\}\}/)
      expect(text).not.toBe(t('audit.unknown', { key: row.messageKey }))
    }
  })
})

describe('formatAuditMessage', () => {
  it.each([
    [groupRow(dayGroup, { key: 'reserve', number: 1 }, 'move'), 'Ryhmä: la 3.8. ip #2 -> Ilmoittautuneet #1 siirto'],
    [
      groupRow(
        { date: '2026-10-31T22:00:00.000Z', key: '2026-11-01-ap', number: 3, time: 'ap' },
        { key: 'reserve', number: 1 },
        'move'
      ),
      'Ryhmä: su 1.11. ap #3 -> Ilmoittautuneet #1 siirto',
    ],
    [groupRow(kpGroup, { key: 'cancelled', number: 5 }), 'Ryhmä: la 3.8. kp #4 -> Peruneet #5'],
    [groupRow({ key: 'reserve', number: 1 }, undefined, 'consequence'), 'Ryhmä: Ilmoittautuneet #1 poistettu seuraus'],
    [startNumbersPublishedAudit(true, { date: '2026-09-14', time: 'ip' }), 'Starttinumerot julkaistu ma 14.9. ip'],
    [registrationCancelledAudit('dog-heat'), 'Ilmoittautuminen peruttiin, syy: Koiran juoksut'],
    [registrationCancelledAudit(), 'Ilmoittautuminen peruttiin, syy: (ei täytetty)'],
    [refundPaytrailFailedAudit(500), 'Maksun palautus epäonnistui Paytrailissa (500): Tuntematon virhe'],
    [
      emailDeliveryFailedAudit({ email: 'a@example.com', status: 'complaint' }),
      'Sähköpostin toimitus epäonnistui (merkittiin roskapostiksi): a@example.com',
    ],
  ])('reads %j in Finnish as %j', (row, finnish) => {
    expect(formatAuditMessage(fi(), row)).toBe(finnish)
  })

  it.each([
    [groupRow(dayGroup, { key: 'reserve', number: 1 }, 'move'), 'Group: Sat 3.8. pm #2 -> Registered #1 move'],
    [groupRow(kpGroup, { key: 'cancelled', number: 5 }), 'Group: Sat 3.8. #4 -> Cancelled #5'],
    [groupRow(undefined, { key: 'kp', number: 4 }), 'Group: #4'],
    [groupRow({ key: 'reserve', number: 1 }, undefined, 'consequence'), 'Group: Registered #1 removed knock-on'],
    [startNumbersEnteredAudit(1, 'ALO'), 'Start number entered for 1 dog (ALO)'],
    [startNumbersEnteredAudit(3), 'Start numbers entered for 3 dogs'],
    [emailBlockedAudit(1), 'Message blocked in the test environment (1 recipient)'],
    [registrationCancelledAudit(), 'Registration cancelled, reason: (not filled in)'],
    [registrationCancelledAudit('auto hajosi'), 'Registration cancelled, reason: auto hajosi'],
    [refundPaytrailFailedAudit(400, 'Revert failed'), 'Refund failed at Paytrail (400): Revert failed'],
    [refundPaytrailFailedAudit(500), 'Refund failed at Paytrail (500): Unknown error'],
    [
      startNumbersPublishedAudit(true, { date: '2026-09-12', eventClass: 'ALO', time: 'ap' }),
      'ALO start numbers published Sat 12.9. am',
    ],
    [
      emailDeliveryFailedAudit({ email: 'a@example.com', status: 'bounce' }),
      'Email delivery failed (bounced): a@example.com',
    ],
    [emailSentAudit('emailTemplate.invitation', ['a@example.com']), 'Email: Invitation, to: a@example.com'],
  ])('reads %j in English as %j', (row, english) => {
    expect(formatAuditMessage(en(), row)).toBe(english)
  })

  it('reads a day the API revived into a Date as the day it was (KOE-1442)', () => {
    const row = groupRow(dayGroup, { key: 'reserve', number: 1 }, 'move')
    const revived = { ...row, messageParams: { ...row.messageParams, fromDate: parseDateOnlyString('2024-08-03') } }

    expect(formatAuditMessage(en(), revived)).toBe('Group: Sat 3.8. pm #2 -> Registered #1 move')
    expect(formatAuditMessage(fi(), revived)).toBe('Ryhmä: la 3.8. ip #2 -> Ilmoittautuneet #1 siirto')
  })

  it('shows a free text the API revived into a Date as the text it was', () => {
    const row = registrationCancelledAudit('2026-10-18')

    expect(formatAuditMessage(en(), { ...row, messageParams: { reason: parseDateOnlyString('2026-10-18') } })).toBe(
      'Registration cancelled, reason: 2026-10-18'
    )
    // A full timestamp keeps its time: only the reviver's local noon marks a bare day.
    expect(formatAuditMessage(en(), { ...row, messageParams: { reason: new Date('2026-10-18T10:00:07.000Z') } })).toBe(
      'Registration cancelled, reason: 2026-10-18T10:00:07.000Z'
    )
  })

  it('shows an old row by the text stored with it', () => {
    expect(formatAuditMessage(en(), { message: 'Tallennettu' })).toBe('Tallennettu')
    expect(formatAuditMessage(en(), { message: 'Tallennettu', messageKey: 'x.y' })).toBe('Tallennettu')
    expect(formatAuditMessage(en(), { message: 'Tallennettu', messageKey: 'audit.messages.notYet' })).toBe(
      'Tallennettu'
    )
  })

  it('names a key this bundle does not know, rather than showing nothing (KOE-1511)', () => {
    expect(formatAuditMessage(en(), { messageKey: 'audit.messages.notYet' })).toBe(
      'Unknown entry: audit.messages.notYet'
    )
    expect(formatAuditMessage(fi(), { messageKey: 'x.y' })).toBe('Tuntematon merkintä: x.y')
  })

  it('falls back to the stored part when its key is missing', () => {
    expect(
      formatAuditMessage(en(), emailSentAudit('registration.email.subject_refund', ['a@example.com'], 'Oma aihe'))
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

describe('auditLabelParams', () => {
  // The class day is written as its Helsinki midnight, an instant; at UTC-10 that instant is local
  // noon, which must not be taken for a revived bare day (KOE-1442).
  it.each([
    ['an instant revived into a Date', new Date('2026-09-18T21:00:00.000Z')] as const,
    ['an instant over the WebSocket', '2026-09-18T21:00:00.000Z'] as const,
  ])('formats %s as the day in Finnish time', (_name, eventDate) => {
    expect(auditLabelParams({ eventClass: 'ALO', eventDate })).toEqual({ eventClass: 'ALO', eventDate: '19.9.2026' })
  })

  it('leaves parameters without a date as they are', () => {
    expect(auditLabelParams({ eventClass: 'ALO' })).toEqual({ eventClass: 'ALO' })
    expect(auditLabelParams()).toEqual({})
    // Neither a Date nor text: nothing to read a day from, so it is left as it came.
    expect(auditLabelParams({ eventDate: 5 })).toEqual({ eventDate: 5 })
    expect(auditLabelParams({ eventDate: '' })).toEqual({ eventDate: '' })
  })
})
