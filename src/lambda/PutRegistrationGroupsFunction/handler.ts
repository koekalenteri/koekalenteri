import { authorize } from '../auth/api'
import { getOrigin } from '../lib/api-gw'
import { audit, registrationAuditKey } from '../lib/audit'
import { parseJSONWithFallback } from '../lib/json'
import { getParam, lambda, response } from '../lib/lambda'
import { getCancelAuditMessage } from '../lib/registration'
import { applyGroupChanges } from '../registration/actions'

const parseGroups = (json: string | null, eventId: string) => {
  const parsed = parseJSONWithFallback(json, [])
  if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
    return []
  }
  const filtered = parsed.filter((g: { eventId?: string }) => g.eventId === eventId)

  if (filtered.length === 0) {
    console.error(`no groups after filtering by eventId='${eventId}'`, parsed)
  }
  return filtered
}

export const putRegistrationGroupsLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }
  const origin = getOrigin(event)
  const eventId = getParam(event, 'eventId')
  const eventGroups = parseGroups(event.body, eventId)

  if (eventGroups.length === 0) {
    return response(422, 'no groups', event)
  }

  const result = await applyGroupChanges({ eventGroups, eventId, origin, user })

  // audit cancellations
  for (const reg of result.cancelledItems) {
    const message = getCancelAuditMessage(reg)
    await audit({
      auditKey: registrationAuditKey(reg),
      message,
      user: user.name,
    })
  }

  const { confirmedEvent, updatedItems, emails } = result

  return response(
    200,
    {
      cancelledFailed: emails.cancelledFailed,
      cancelledOk: emails.cancelledOk,
      classes: confirmedEvent.classes,
      entries: confirmedEvent.entries,
      invitedFailed: emails.invitedFailed,
      invitedOk: emails.invitedOk,
      items: updatedItems,
      pickedFailed: emails.pickedFailed,
      pickedOk: emails.pickedOk,
      reserveFailed: emails.reserveFailed,
      reserveOk: emails.reserveOk,
    },
    event
  )
}

export default lambda('putRegistrationGroups', putRegistrationGroupsLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
