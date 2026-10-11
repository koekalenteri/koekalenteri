import type { ParseKeys, TFunction } from 'i18next'
import type {
  AuditUserSource,
  JsonAuditDetail,
  JsonAuditRecord,
  JsonEmailDeliveryStatus,
  JsonRegistrationGroup,
} from '../types'
import { format } from 'date-fns/format'
import { formatDate, WEEKDAY_DAY_FORMAT, zonedParseDate } from '../i18n/dates'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from './registration'
import { isDateOnlyString } from './utils'

/**
 * Whom an audit row is attributed to. An authenticated user has no `source`; a name taken from the
 * registration's own people says so, and the trail shows the difference.
 */
export interface AuditActor {
  name: string
  source?: AuditUserSource
}

/** The `user` fields of an audit row (or a transaction) for the actor, for spreading into the record. */
export const auditUser = (actor: AuditActor): Pick<JsonAuditRecord, 'user' | 'userSource'> => ({
  user: actor.name,
  ...(actor.source ? { userSource: actor.source } : {}),
})

/**
 * What an audit row says, in two forms (KOE-1442). `messageKey` and `messageParams` are what the
 * trail translates into the reader's language; `message` is the same sentence in Finnish, stored
 * for the rows' other readers and for a client that does not know the key. The Finnish translation
 * of each key reads exactly as its `message`, so a Finnish trail looks as it did before the keys.
 *
 * A `<name>Key` parameter names a translation (a template, a reason) that the trail shows in its
 * place as `<name>`. Old rows have no key and keep their Finnish text.
 */
type AuditMessageKey = Extract<ParseKeys<'translation'>, `audit.messages.${string}`>
type AuditMessageParams = NonNullable<JsonAuditRecord['messageParams']>
export type AuditMessage = Pick<JsonAuditRecord, 'details' | 'message' | 'messageKey' | 'messageParams'>

const auditMessage = (messageKey: AuditMessageKey, message: string, messageParams?: AuditMessageParams) => ({
  message,
  messageKey,
  ...(messageParams ? { messageParams } : {}),
})

/** The lists a dog can stand on outside a day's group, by the names the participant list gives them. */
const GROUP_LIST_NAMES: Record<string, { fi: string; key: ParseKeys<'translation'> }> = {
  [GROUP_KEY_CANCELLED]: { fi: 'Peruneet', key: 'eventManagement.participantSelection.cancelled' },
  [GROUP_KEY_RESERVE]: { fi: 'Ilmoittautuneet', key: 'eventManagement.participantSelection.registered' },
}

type AuditGroup = Pick<JsonRegistrationGroup, 'date' | 'key' | 'number' | 'time'> | undefined

/** Day parameters stand alone (`date`, `time`) or for one side of a group move (`fromDate`, `toTime`). */
type DayParamPrefix = '' | 'from' | 'to'
type DayParamPart = 'Date' | 'Time' | 'TimeKey'

const dayParamName = (prefix: DayParamPrefix, part: DayParamPart) =>
  prefix ? `${prefix}${part}` : `${part.charAt(0).toLowerCase()}${part.slice(1)}`

/** A bare yyyy-MM-dd is a day in Finnish time; anything else is an instant already. */
const toDay = (date: string | Date) => (isDateOnlyString(date) ? zonedParseDate(date) : date)

/** A day as the Finnish trail names it ("su 8.11."): the pattern Finnish `dateFormat.wdshort` (wdshort2) uses. */
const finnishAuditDay = (date: string | Date) => formatDate(toDay(date), WEEKDAY_DAY_FORMAT)

export const formatGroupAuditInfo = (group: AuditGroup): string => {
  if (!group) return ''

  const list = GROUP_LIST_NAMES[group.key]
  if (list) return `${list.fi} #${group.number}`

  return [group.date && finnishAuditDay(group.date), group.time, `#${group.number}`].filter(Boolean).join(' ')
}

/**
 * A day and a time as parameters: the day as yyyy-MM-dd in Finnish time, the time by its
 * `audit.time.*` key with the code itself as the Finnish fallback.
 */
const dayParams = (prefix: DayParamPrefix, date?: string | Date, time?: string): AuditMessageParams => ({
  ...(date ? { [dayParamName(prefix, 'Date')]: formatDate(toDay(date), 'yyyy-MM-dd') } : {}),
  ...(time ? { [dayParamName(prefix, 'Time')]: time, [dayParamName(prefix, 'TimeKey')]: `audit.time.${time}` } : {}),
})

/**
 * A group as parameters for the trail to name in the reader's language: a list by its translation,
 * a day group by its day and time. Each translated part keeps its Finnish text as the fallback.
 */
const groupParams = (side: 'from' | 'to', group: NonNullable<AuditGroup>): AuditMessageParams => {
  const list = GROUP_LIST_NAMES[group.key]
  if (list) return { [`${side}Group`]: list.fi, [`${side}GroupKey`]: list.key, [`${side}Number`]: group.number }

  return { ...dayParams(side, group.date, group.time), [`${side}Number`]: group.number }
}

/** Why a registration's group changed: the secretary moved it, another move pushed it, or the automatic repair placed it. */
export type GroupChangeReason = 'automatic' | 'consequence' | 'move'

const GROUP_CHANGE_REASONS: Record<GroupChangeReason, string> = {
  automatic: '(automaattinen sijoitus)',
  consequence: 'seuraus',
  move: 'siirto',
}

export const groupChangeAudit = (previous: AuditGroup, group: AuditGroup, reason?: GroupChangeReason): AuditMessage => {
  const oldGroupInfo = previous ? `${formatGroupAuditInfo(previous)} -> ` : ''
  const reasonText = reason ? GROUP_CHANGE_REASONS[reason] : ''
  const message = `Ryhmä: ${oldGroupInfo}${formatGroupAuditInfo(group)} ${reasonText}`.trim()
  if (!group) return { message }

  const messageParams = {
    ...(previous ? groupParams('from', previous) : {}),
    ...groupParams('to', group),
    ...(reason ? { reason: reasonText, reasonKey: `audit.groupReason.${reason}` } : {}),
  }
  return auditMessage(previous ? 'audit.messages.groupChanged' : 'audit.messages.groupSet', message, messageParams)
}

export const startNumberPublishedAudit = (number: number) =>
  auditMessage('audit.messages.startNumberPublished', `Starttinumero julkaistu: ${number}`, { number })

export const startNumberReleasedAudit = (number: number) =>
  auditMessage('audit.messages.startNumberReleased', `Starttinumero vapautettu: ${number}`, { number })

/** The previous number is part of the answer: a corrected entry reads as the correction it is (KOE-1355). */
export const startNumberSavedAudit = (number: number, previous?: number) =>
  previous === undefined || previous === number
    ? auditMessage('audit.messages.startNumberSaved', `Starttinumero tallennettu: ${number}`, { number })
    : auditMessage('audit.messages.startNumberChanged', `Starttinumero tallennettu: ${previous} -> ${number}`, {
        number,
        previous,
      })

interface StartNumbersScope {
  /** The day, yyyy-MM-dd (KOE-1304). */
  date?: string
  eventClass?: string
  /** The half of the day (KOE-1430); only with a day. */
  time?: string
}

const startNumbersPublishedKey = (published: boolean, eventClass?: string, day?: boolean): AuditMessageKey => {
  if (eventClass && day) {
    return published ? 'audit.messages.classStartNumbersPublishedDay' : 'audit.messages.classStartNumbersHiddenDay'
  }
  if (eventClass)
    return published ? 'audit.messages.classStartNumbersPublished' : 'audit.messages.classStartNumbersHidden'
  if (day) return published ? 'audit.messages.startNumbersPublishedDay' : 'audit.messages.startNumbersHiddenDay'
  return published ? 'audit.messages.startNumbersPublished' : 'audit.messages.startNumbersHidden'
}

/**
 * Numbers published or hidden, for a class, a day or a half of one. The keys are the publishing
 * panel's, but the day reads as the group rows do ("la 12.9. ap"), not as the panel's confirmation
 * names a half. The day and the time go as parts, for the trail to name.
 */
export const startNumbersPublishedAudit = (published: boolean, { date, eventClass, time }: StartNumbersScope = {}) => {
  const state = published ? 'julkaistu' : 'piilotettu'
  const day = date ? [finnishAuditDay(date), time].filter(Boolean).join(' ') : ''
  const subject = eventClass ? `${eventClass} starttinumerot` : 'Starttinumerot'
  const params = { ...(eventClass ? { eventClass } : {}), ...(date ? dayParams('', date, time) : {}) }

  return auditMessage(
    startNumbersPublishedKey(published, eventClass, Boolean(date)),
    [subject, state, day].filter(Boolean).join(' '),
    Object.keys(params).length ? params : undefined
  )
}

export const startNumbersEnteredAudit = (count: number, eventClass?: string) => {
  const entered = `${count === 1 ? 'Starttinumero' : 'Starttinumerot'} syötetty ${count} koiralle`
  return eventClass
    ? auditMessage('audit.messages.startNumbersEnteredClass', `${entered} (${eventClass})`, { count, eventClass })
    : auditMessage('audit.messages.startNumbersEntered', entered, { count })
}

/**
 * The translation that names a sent registration email by its subject for the context, as the email
 * itself is named (KOE-1455). Other emails go by their template, `emailTemplate.<id>`.
 */
export const emailSubjectAuditKey = (context?: string) =>
  context ? `registration.email.subject_${context}` : 'registration.email.subject'

/**
 * An email sent to a registration's people. `template` is the name the row was written with, the
 * subject in the registration's language; `templateKey` names it for the reader.
 */
export const emailSentAudit = (template: string, templateKey: string, recipients: string[]) =>
  auditMessage('audit.messages.emailSentTo', `Sähköposti: ${template}, vastaanottajat: ${recipients.join(', ')}`, {
    recipients: recipients.join(', '),
    template,
    templateKey,
  })

export const emailFailedAudit = (template: string, templateKey: string, recipients: string[]) =>
  auditMessage('audit.messages.emailFailedTo', `Lähetys epäonnistui: ${template}: ${recipients.join(', ')}`, {
    recipients: recipients.join(', '),
    template,
    templateKey,
  })

export const emailBlockedAudit = (count: number) =>
  auditMessage(
    'audit.messages.emailBlocked',
    `Viesti estetty testiympäristössä (${count} ${count === 1 ? 'vastaanottaja' : 'vastaanottajaa'})`,
    { count }
  )

const DELIVERY_STATUS_TEXTS: Record<JsonEmailDeliveryStatus['status'], string> = {
  bounce: 'palautui',
  complaint: 'merkittiin roskapostiksi',
}

type EmailDeliveryFailure = Pick<JsonEmailDeliveryStatus, 'email' | 'reason' | 'status' | 'template'>

/** A bounce or a complaint SES reported. The template and the reason are details, shown on request. */
export const emailDeliveryFailedAudit = ({ email, reason, status, template }: EmailDeliveryFailure): AuditMessage => {
  const statusText = DELIVERY_STATUS_TEXTS[status]
  const details: JsonAuditDetail[] = [
    ...(template
      ? [
          {
            detailKey: 'audit.details.emailTemplate',
            detailParams: { template, templateKey: `emailTemplate.${template}` },
          },
        ]
      : []),
    ...(reason ? [{ detailKey: 'audit.details.deliveryReason', detailParams: { reason } }] : []),
  ]

  return {
    ...(details.length ? { details } : {}),
    ...auditMessage(
      'audit.messages.emailDeliveryFailed',
      `Sähköpostin toimitus epäonnistui (${statusText}): ${email}`,
      { email, status: statusText, statusKey: `audit.deliveryStatus.${status}` }
    ),
  }
}

export const registrationCreatedAudit = () => auditMessage('audit.messages.registrationCreated', 'Ilmoittautui')

export const registrationAddedAudit = () => auditMessage('audit.messages.registrationAdded', 'Lisäsi ilmoittautumisen')

export const registrationConfirmedAudit = () =>
  auditMessage('audit.messages.registrationConfirmed', 'Ilmoittautumisen vahvistus')

const REASON_MISSING = '(ei täytetty)'

/**
 * A cancellation and its reason. A predefined reason is named by its key, so the reader sees it in
 * their language; a reason the entrant wrote is shown as written; no reason says it was not given.
 */
export const registrationCancelledAudit = (reasonText?: string, reasonKey?: string) => {
  const reason = reasonText || REASON_MISSING
  const key = reasonText ? reasonKey : 'audit.reasonMissing'
  return auditMessage('audit.messages.registrationCancelled', `Ilmoittautuminen peruttiin, syy: ${reason}`, {
    reason,
    ...(key ? { reasonKey: key } : {}),
  })
}

export const registrationDaysMismatchAudit = (days: string, eventClass?: string | null) =>
  eventClass
    ? auditMessage(
        'audit.messages.registrationDaysOutsideClass',
        `Valitut päivät (${days}) eivät ole luokan ${eventClass} päiviä`,
        { days, eventClass }
      )
    : auditMessage(
        'audit.messages.registrationDaysOutsideEvent',
        `Valitut päivät (${days}) eivät ole tapahtuman päiviä`,
        {
          days,
        }
      )

export const invitationAwaitingPaymentAudit = () =>
  auditMessage('audit.messages.invitationAwaitingPayment', 'Koekutsu lähetetään, kun koepaikka on maksettu')

export const internalNotesChangedAudit = () =>
  auditMessage('audit.messages.internalNotesChanged', 'Muutti sisäistä kommenttia')

/** A money movement: the provider's name and the amount are written as the receipt shows them. */
type PaymentAuditKind = 'payment' | 'paymentFailed' | 'refund' | 'refundFailed' | 'refundPending'

const PAYMENT_AUDIT_TEXTS: Record<PaymentAuditKind, string> = {
  payment: 'Maksu',
  paymentFailed: 'Maksu epäonnistui',
  refund: 'Palautus',
  refundFailed: 'Palautus epäonnistui',
  refundPending: 'Palautus on kesken',
}

export const paymentAudit = (kind: PaymentAuditKind, provider: string, amount: string) =>
  auditMessage(`audit.messages.${kind}`, `${PAYMENT_AUDIT_TEXTS[kind]} (${provider}), ${amount}`, { amount, provider })

/** A payment that arrived for a dog already paid for: written on both registrations, each naming the other. */
export const duplicatePaymentAudit = (provider: string, amount: string, otherRegistrationId: string) =>
  auditMessage(
    'audit.messages.paymentDuplicate',
    `Päällekkäinen maksu (${provider}), ${amount}, toinen ilmoittautuminen: ${otherRegistrationId}`,
    { amount, provider, registrationId: otherRegistrationId }
  )

export const duplicatePaymentOfOtherAudit = (provider: string, amount: string, payingRegistrationId: string) =>
  auditMessage(
    'audit.messages.paymentDuplicateOther',
    `Toisen ilmoittautumisen päällekkäinen maksu (${provider}), ${amount}, maksun ilmoittautuminen: ${payingRegistrationId}`,
    { amount, provider, registrationId: payingRegistrationId }
  )

export const refundPaytrailFailedAudit = (message: string, status: number, error: string) =>
  auditMessage('audit.messages.refundPaytrailFailed', message, { error, status })

/** A result saved for the dog, with the result's own text when it has one. */
export const resultSavedAudit = (changed: boolean, result: string) => {
  const action = changed ? 'Muutti tulosta' : 'Tallensi tuloksen'
  if (!result) return auditMessage(changed ? 'audit.messages.resultChanged' : 'audit.messages.resultSaved', action)

  return auditMessage(
    changed ? 'audit.messages.resultChangedDetail' : 'audit.messages.resultSavedDetail',
    `${action}: ${result}`,
    { result }
  )
}

export const eventCopiedToAudit = (stage: string, eventId: string) =>
  auditMessage('audit.messages.eventCopiedTo', `Kopioitu ympäristöön ${stage} (${eventId})`, { eventId, stage })

export const eventCopiedFromAudit = (stage: string, eventId: string) =>
  auditMessage('audit.messages.eventCopiedFrom', `Kopioitu ympäristöstä ${stage} (${eventId})`, { eventId, stage })

/*
 * Reading a row back, in the reader's language. Shared with the tests so that the Finnish reading of
 * every message can be checked against the `message` stored with it.
 */

type AuditReadParams = Record<string, unknown>

/**
 * The namespaces an audit row may name a translation from: its own messages and the email template,
 * cancellation reason and group names it reuses. A key missing from the bundle (a row written by a
 * newer backend) is not refused here; every lookup passes the stored text as `defaultValue`.
 */
const AUDIT_TRANSLATION_KEY = /^(audit|emailTemplate|eventManagement|registration)\.[\w.-]+$/

const isAuditTranslationKey = (value: unknown): value is ParseKeys<'translation'> =>
  typeof value === 'string' && AUDIT_TRANSLATION_KEY.test(value)

const DAY_PARAMS = new Set(['date', 'fromDate', 'toDate'])

/**
 * The API's JSON reviver turns a bare yyyy-MM-dd into local noon of that day (`parseDateOnlyString`);
 * that mark is how a revived day is told from a revived instant.
 */
const isRevivedDay = (value: Date) =>
  value.getHours() === 12 && value.getMinutes() === 0 && value.getSeconds() === 0 && value.getMilliseconds() === 0

/**
 * A day parameter (`date`, `fromDate`, `toDate`) as a Date to format in Finnish time. `dayParams`
 * writes these only as yyyy-MM-dd, which arrives as that string over the WebSocket and as local noon
 * through the API; both are read as that day in Finnish time, so a reader west of UTC-10 sees the
 * same day. Only for these: an instant elsewhere is formatted as the instant it is.
 */
const auditDay = (value: unknown): Date | undefined => {
  if (value instanceof Date) return zonedParseDate(format(value, 'yyyy-MM-dd'))
  return isDateOnlyString(value) ? zonedParseDate(value) : undefined
}

/** Text a parameter can stand for. A free text that happened to look like a date was revived too. */
const paramText = (value: unknown) => {
  if (value instanceof Date) return isRevivedDay(value) ? format(value, 'yyyy-MM-dd') : value.toISOString()
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

/**
 * The parameters as a translation reads them. A `<name>Key` parameter names a translation, and its
 * text in the reader's language becomes `<name>`; the value stored under `<name>` is the fallback.
 */
const translateAuditParams = (t: TFunction, params: AuditReadParams = {}): AuditReadParams => {
  const translated: AuditReadParams = {}
  for (const [name, value] of Object.entries(params)) {
    translated[name] = DAY_PARAMS.has(name) || !(value instanceof Date) ? value : paramText(value)
  }
  for (const [name, value] of Object.entries(params)) {
    if (!name.endsWith('Key') || !isAuditTranslationKey(value)) continue
    const target = name.slice(0, -'Key'.length)
    translated[target] = t(value, { defaultValue: paramText(params[target]) })
  }
  return translated
}

/** "Sat 7.11. pm", from the day and time parameters of a side, or of the row itself. */
const dayLabel = (t: TFunction, params: AuditReadParams, prefix: DayParamPrefix) => {
  const date = auditDay(params[dayParamName(prefix, 'Date')])
  const time = params[dayParamName(prefix, 'Time')]
  return [date ? t('dateFormat.wdshort', { date }) : '', typeof time === 'string' ? time : ''].filter(Boolean).join(' ')
}

/** A group of a group move: a named list ("Registered #1") or a day and time ("Sat 7.11. pm #2"). */
const groupLabel = (t: TFunction, params: AuditReadParams, side: 'from' | 'to') => {
  const number = params[`${side}Number`]
  if (typeof number !== 'number') return ''

  const name = params[`${side}Group`]
  if (typeof name === 'string' && name) return `${name} #${number}`

  return [dayLabel(t, params, side), `#${number}`].filter(Boolean).join(' ')
}

const auditMessageParams = (t: TFunction, params?: AuditReadParams): AuditReadParams => {
  const translated = translateAuditParams(t, params)
  const day = dayLabel(t, translated, '')

  return {
    ...translated,
    ...(day ? { day } : {}),
    ...(typeof translated.toNumber === 'number'
      ? {
          from: groupLabel(t, translated, 'from'),
          // A move without a reason would otherwise print the literal placeholder.
          reason: translated.reason ?? '',
          to: groupLabel(t, translated, 'to'),
        }
      : {}),
  }
}

/** A row's message in the reader's language, or the stored text when it has no key this reader knows. */
export const formatAuditMessage = (
  t: TFunction,
  {
    message,
    messageKey,
    messageParams,
  }: Pick<JsonAuditRecord, 'message' | 'messageKey'> & {
    messageParams?: AuditReadParams
  }
) => {
  if (!isAuditTranslationKey(messageKey)) return message

  return t(messageKey, { ...auditMessageParams(t, messageParams), defaultValue: message }).trim()
}

/**
 * A change label's parameters as its translation reads them. `eventDate` is an instant, the class
 * day's midnight in Finnish time (`getClassPlaceChanges`), and is formatted as that instant there,
 * never through the day reader above, which would take a UTC-10 reader's local noon for a bare day.
 */
export const auditLabelParams = (params?: AuditReadParams) => {
  const eventDate = labelInstant(params?.eventDate)
  return {
    ...params,
    ...(eventDate ? { eventDate: formatDate(eventDate, 'd.M.yyyy') } : {}),
  }
}

/** The instant a label parameter names: a Date the reviver made, or the ISO text the WebSocket carries. */
const labelInstant = (value: unknown): Date | undefined => {
  if (value instanceof Date) return value
  return typeof value === 'string' && value ? new Date(value) : undefined
}

export const formatAuditDetail = (t: TFunction, { detailKey, detailParams }: JsonAuditDetail) => {
  if (!isAuditTranslationKey(detailKey)) return ''

  return t(detailKey, { ...translateAuditParams(t, detailParams), defaultValue: '' })
}
