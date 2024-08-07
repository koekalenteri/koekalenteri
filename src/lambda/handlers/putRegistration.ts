import type { JsonConfirmedEvent, JsonRegistration } from '../../types'

import { diff } from 'deep-object-diff'
import { nanoid } from 'nanoid'

import { i18n } from '../../i18n/lambda'
import { CONFIG } from '../config'
import { audit, registrationAuditKey } from '../lib/audit'
import { getOrigin, getUsername } from '../lib/auth'
import { emailTo, registrationEmailTemplateData, sendTemplatedMail } from '../lib/email'
import { getEvent, updateRegistrations } from '../lib/event'
import { parseJSONWithFallback } from '../lib/json'
import { lambda } from '../lib/lambda'
import { getRegistration } from '../lib/registration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const { emailFrom, eventTable, registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)

const getData = async (registration: JsonRegistration) => {
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(registration.eventId)
  const existing = registration.id ? await getRegistration(registration.eventId, registration.id) : undefined

  return { confirmedEvent, existing }
}

const isAlreadyRegistered = async (eventId: string, regNo: string): Promise<JsonRegistration | undefined> => {
  const existingRegistrations = await dynamoDB.query<JsonRegistration>('eventId = :eventId', { ':eventId': eventId })
  const alreadyRegistered = existingRegistrations?.find((r) => r.dog.regNo === regNo && r.state === 'ready')

  return alreadyRegistered
}

const getEmailContext = (update: boolean, cancel: boolean, confirm: boolean, invitation: boolean) => {
  if (cancel) return 'cancel'
  if (confirm) return 'confirm'
  if (invitation) return 'invitation'
  if (update) return 'update'
  return ''
}

const getAuditMessage = (
  cancel: boolean,
  confirm: boolean,
  data: JsonRegistration,
  existing?: JsonRegistration
): string => {
  if (cancel) return 'Ilmoittautuminen peruttiin'
  if (confirm) return 'Ilmoittautumisen vahvistus'
  if (!existing) return 'Ilmoittautui'

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

const putRegistrationLambda = lambda('putRegistration', async (event) => {
  const username = await getUsername(event)
  const timestamp = new Date().toISOString()
  const origin = getOrigin(event)

  const registration: JsonRegistration = parseJSONWithFallback(event.body)
  const { confirmedEvent, existing } = await getData(registration)

  if (!existing) {
    registration.id = nanoid(10)
    registration.createdAt = timestamp
    registration.createdBy = username
  }

  const update = !!existing
  const cancel = !existing?.cancelled && !!registration.cancelled
  const confirm = !existing?.confirmed && !!registration.confirmed && !existing?.cancelled
  const invitation = !existing?.invitationRead && !!registration.invitationRead && !existing?.cancelled

  // modification info is always updated
  registration.modifiedAt = timestamp
  registration.modifiedBy = username

  // Prevent double registrations when trying to insert new registration
  const alreadyRegistered = !existing && (await isAlreadyRegistered(registration.eventId, registration.dog.regNo))
  if (alreadyRegistered) {
    return response(
      409,
      {
        message: 'Conflict: Dog already registered to this event',
        cancelled: Boolean(alreadyRegistered.cancelled),
      },
      event
    )
  }

  const data: JsonRegistration = { ...existing, ...registration }
  await dynamoDB.write(data)

  if (cancel) {
    await updateRegistrations(registration.eventId, eventTable)
  }

  const message = getAuditMessage(cancel, confirm, data, existing)
  if (message) {
    audit({
      auditKey: registrationAuditKey(registration),
      message,
      user: username,
    })
  }

  const context = getEmailContext(update, cancel, confirm, invitation)
  if (context && registration.handler?.email && registration.owner?.email) {
    // send update message when registration is updated, confirmed or cancelled
    const to = emailTo(registration)
    const templateData = registrationEmailTemplateData(registration, confirmedEvent, origin, context)

    await sendTemplatedMail('registration', registration.language, emailFrom, to, templateData)
  }

  return response(200, data, event)
})

export default putRegistrationLambda
