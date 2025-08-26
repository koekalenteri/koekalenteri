import type { EmailTemplateId, JsonConfirmedEvent, JsonRegistration, RegistrationTemplateContext } from '../../types'

import { diff } from 'deep-object-diff'

import { formatDate } from '../../i18n/dates'
import { i18n } from '../../i18n/lambda'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, isPredefinedReason } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

import { audit, registrationAuditKey } from './audit'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from './email'
import { LambdaError } from './lambda'

const { emailFrom, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

export const getRegistration = async (eventId: string, registrationId: string): Promise<JsonRegistration> => {
  const registration = await dynamoDB.read<JsonRegistration>(
    {
      eventId: eventId,
      id: registrationId,
    },
    registrationTable
  )
  if (!registration) {
    throw new LambdaError(404, `Registration with id '${registrationId}' for event with id '${eventId}' was not found`)
  }
  return registration
}

export const saveRegistration = async (data: JsonRegistration) => dynamoDB.write(data, registrationTable)

export const updateRegistrationField = async <F extends keyof JsonRegistration>(
  eventId: JsonRegistration['eventId'],
  id: JsonRegistration['id'],
  field: F,
  value: JsonRegistration[F]
) =>
  dynamoDB.update(
    { eventId, id },
    {
      set: {
        [field]: value,
      },
    }
  )

const setLastEmail = async (reg: JsonRegistration, value: string) => {
  // update the in-memory object too
  reg.lastEmail = value
  return updateRegistrationField(reg.eventId, reg.id, 'lastEmail', value)
}

export const setReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => !r.reserveNotified)
      .map(({ eventId, id, group }) => updateRegistrationField(eventId, id, 'reserveNotified', group?.number ?? 999))
  )

export const updateReserveNotified = async (registrations: JsonRegistration[]) =>
  Promise.all(
    registrations
      .filter((r) => r.group?.number && r.reserveNotified !== r.group.number)
      .map(({ eventId, id, group }) => updateRegistrationField(eventId, id, 'reserveNotified', group?.number ?? 999))
  )

// exported for testing
export const getLastEmailInfo = (
  template: EmailTemplateId,
  templateName: string,
  registration: JsonRegistration,
  date: string
): string => {
  if (template === 'reserve') {
    return `${templateName} (#${registration.group?.number ?? '?'}) ${date}`
  }

  return `${templateName} ${date}`
}

export const sendTemplatedEmailToEventRegistrations = async (
  template: EmailTemplateId,
  confirmedEvent: JsonConfirmedEvent,
  registrations: JsonRegistration[],
  origin: string | undefined,
  text: string,
  user: string,
  context: RegistrationTemplateContext
) => {
  const t = i18n.getFixedT('fi')
  const lastEmailDate = formatDate(new Date(), 'd.M.yyyy HH:mm')
  const templateName = t(`emailTemplate.${template}`)
  const ok: string[] = []
  const failed: string[] = []
  for (const registration of registrations) {
    const to = emailTo(registration)
    const data = registrationEmailTemplateData(registration, confirmedEvent, origin, context, text)
    const auditSubject = context ? data.subject : templateName
    try {
      await sendTemplatedMail(template, registration.language, emailFrom, to, data)
      ok.push(...to)
      await audit({
        auditKey: registrationAuditKey(registration),
        message: `Email: ${auditSubject}, to: ${to.join(', ')}`,
        user,
      })
      await setLastEmail(registration, getLastEmailInfo(template, templateName, registration, lastEmailDate))

      // Update the messagesSent property to track that this template has been sent
      const messagesSent = registration.messagesSent || {}
      messagesSent[template] = true
      await updateRegistrationField(registration.eventId, registration.id, 'messagesSent', messagesSent)

      // Update the in-memory object too
      registration.messagesSent = messagesSent
    } catch (e) {
      failed.push(...to)
      await audit({
        auditKey: registrationAuditKey(registration),
        message: `FAILED ${auditSubject}: ${to.join(', ')}`,
        user,
      })
      console.error(e)
    }
  }
  return { ok, failed }
}

export const isParticipantGroup = (group?: string): boolean =>
  Boolean(group) && group !== GROUP_KEY_RESERVE && group !== GROUP_KEY_CANCELLED

/**
 * Group registrations by class or eventType
 */
export const groupRegistrationsByClass = (registrations: JsonRegistration[]): Record<string, JsonRegistration[]> => {
  const result: Record<string, JsonRegistration[]> = {}

  for (const reg of registrations) {
    const classKey = reg.class ?? reg.eventType
    result[classKey] = result[classKey] || []
    result[classKey].push(reg)
  }

  return result
}

/**
 * Group registrations by class and then by group
 */
export const groupRegistrationsByClassAndGroup = (
  registrationsByClass: Record<string, JsonRegistration[]>
): Record<string, Record<string, JsonRegistration[]>> => {
  const result: Record<string, Record<string, JsonRegistration[]>> = {}

  for (const [classKey, classRegs] of Object.entries(registrationsByClass)) {
    result[classKey] = {}

    for (const reg of classRegs) {
      if (!isParticipantGroup(reg.group?.key)) continue

      const groupKey = reg.group!.key
      result[classKey][groupKey] = result[classKey][groupKey] || []
      result[classKey][groupKey].push(reg)
    }
  }

  return result
}

/**
 * Find classes where all participants have received the message
 */
export const findClassesToMark = (
  registrationsByClassAndGroup: Record<string, Record<string, Partial<JsonRegistration>[]>>,
  template: EmailTemplateId
): string[] => {
  const classesToMark: string[] = []

  for (const [classKey, groupsMap] of Object.entries(registrationsByClassAndGroup)) {
    if (Object.keys(groupsMap).length === 0) continue

    const allGroupsReceived = Object.values(groupsMap).every(
      (groupRegs) => groupRegs.length > 0 && groupRegs.every((reg) => reg.messagesSent?.[template])
    )

    if (allGroupsReceived) {
      classesToMark.push(classKey)
    }
  }

  return classesToMark
}

export const findExistingRegistrationToEventForDog = async (
  eventId: string,
  regNo: string
): Promise<JsonRegistration | undefined> => {
  const existingRegistrations = await dynamoDB.query<JsonRegistration>({
    key: 'eventId = :eventId',
    values: { ':eventId': eventId },
    table: registrationTable,
  })
  const alreadyRegistered = existingRegistrations?.find((r) => r.dog.regNo === regNo && r.state === 'ready')

  return alreadyRegistered
}

export const getCancelAuditMessage = (data: JsonRegistration) => {
  if (!data.cancelReason) return 'Ilmoittautuminen peruttiin, syy: (ei täytetty)'

  if (isPredefinedReason(data.cancelReason)) {
    const t = i18n.getFixedT('fi')
    const reason = t(`registration.cancelReason.${data.cancelReason}`)

    return `Ilmoittautuminen peruttiin, syy: ${reason}`
  }

  return `Ilmoittautuminen peruttiin, syy: ${data.cancelReason}`
}

export const getRegistrationChanges = (existing: JsonRegistration, data: JsonRegistration) => {
  const t = i18n.getFixedT('fi')
  const changes: Partial<JsonRegistration> = diff(existing, data)
  console.debug('Audit changes', changes)
  const keys = ['class', 'dog', 'breeder', 'owner', 'handler', 'qualifyingResults', 'notes'] as const
  const modified: string[] = []

  for (const key of keys) {
    if (changes[key]) {
      modified.push(t(`registration.${key}`))
    }
  }

  return modified.length ? 'Muutti: ' + modified.join(', ') : ''
}
