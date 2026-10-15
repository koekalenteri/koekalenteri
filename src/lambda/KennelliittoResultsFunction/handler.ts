import type { JsonConfirmedEvent, JsonEventType, Organizer } from '../../types'
import { isOfficialEventType } from '../../lib/event'
import { kcFormatOfEventType } from '../../lib/kennelliittoResults'
import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { getEvent } from '../lib/event'
import { assertEventOrganizerAccess } from '../lib/eventAuth'
import { parseJSONWithFallback } from '../lib/json'
import {
  handOverKennelliittoResults,
  previewKennelliittoResults,
  sendKennelliittoResults,
} from '../lib/kennelliittoResults'
import { getParam, httpError, lambda, response } from '../lib/lambda'
import { publishEventChange, publishRegistrationPatches } from '../lib/ws/actions'
import CustomDynamoClient from '../utils/CustomDynamoClient'

/**
 * Dogs in one sending. A request has 29 s at the gateway and each dog is one call to Kennelliitto;
 * ten at a time leaves room for a slow answer, and the page asks again for the next ten.
 */
const MAX_SENT_DOGS = 10

interface KennelliittoRequest {
  action?: string
  /** Send again even where the result is what was sent, after an edit made in Omakoira itself. */
  force?: boolean
  registrationIds?: unknown
  /** Accepts that the dogs listed as left out stay out of the hand-over. */
  withoutBlocked?: boolean
}

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const idsOf = (value: unknown): string[] | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) {
    throw httpError(422, 'registrationIds must be a list of ids')
  }
  return value
}

/**
 * Results to Kennelliitto's Omakoira, for the people who may save the trial's results: the preview the
 * dialog shows (no write), the sending ten dogs at a time, and the hand-over to the chief judge.
 */
const kennelliittoResultsLambda = lambda('kennelliittoResults', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const eventId = getParam(event, 'eventId')
  const body = parseJSONWithFallback<KennelliittoRequest>(event.body, {})
  const ids = idsOf(body.registrationIds)

  // As last written: the lock and the state are read from this row.
  const confirmedEvent = await getEvent<JsonConfirmedEvent>(eventId, true)
  assertEventOrganizerAccess(user, memberOf, confirmedEvent)

  const eventType = await dynamoDB.read<JsonEventType>(
    { eventType: kcFormatOfEventType(confirmedEvent.eventType) },
    CONFIG.eventTypeTable
  )
  const organizer = await dynamoDB.read<Organizer>({ id: confirmedEvent.organizer.id }, CONFIG.organizerTable)
  const ctx = {
    event: confirmedEvent,
    official: isOfficialEventType(confirmedEvent.eventType, eventType?.official),
    organizerKcId: organizer?.kcId,
    userName: user.name,
  }
  const organizerId = confirmedEvent.organizer.id
  const publishEvent = async (patch: Parameters<typeof publishEventChange>[0]['patch'] | undefined) => {
    if (patch) await publishEventChange({ audience: 'admin', organizerId, patch })
  }

  switch (body.action) {
    case 'preview': {
      const { eventPatch, ...preview } = await previewKennelliittoResults(ctx, ids)
      await publishEvent(eventPatch && { ...eventPatch, eventId })
      return response(200, preview, event)
    }
    case 'send': {
      if (!ids?.length || ids.length > MAX_SENT_DOGS) {
        throw httpError(422, `send takes 1 to ${MAX_SENT_DOGS} registrationIds`)
      }
      const { eventPatch, patches, ...sent } = await sendKennelliittoResults(ctx, ids, { force: body.force === true })
      if (patches.length) await publishRegistrationPatches(eventId, patches, organizerId)
      await publishEvent(eventPatch && { ...eventPatch, eventId })
      if (sent.blockers.length) throw httpError(409, { blockers: sent.blockers, error: 'blocked' })
      return response(200, { ...sent, kcResults: patches }, event)
    }
    case 'handOver': {
      const result = await handOverKennelliittoResults(ctx, { withoutBlocked: body.withoutBlocked === true })
      await publishEvent(result.eventPatch && { ...result.eventPatch, eventId })
      if (result.blockers.length) throw httpError(409, { blockers: result.blockers, error: 'blocked' })
      if (result.unsent) throw httpError(409, { dogs: result.unsent, error: 'unsentResults' })
      if (result.needsConfirmation)
        throw httpError(409, { dogs: result.needsConfirmation, error: 'confirmationNeeded' })
      if (result.refused) throw httpError(502, { error: 'kennelliittoRefused', ...result.refused })
      return response(200, { handedOver: result.handedOver }, event)
    }
    default:
      throw httpError(400, 'unknown action')
  }
})

export default kennelliittoResultsLambda
