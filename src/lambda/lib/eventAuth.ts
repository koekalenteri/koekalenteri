import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonDogEvent, JsonUser } from '../../types'
import { authorizeWithMemberOf } from './auth'
import { getEvent } from './event'
import { LambdaError } from './lambda'

export const assertEventOrganizerAccess = (user: JsonUser, memberOf: string[], item: JsonDogEvent) => {
  if (!user.admin && !memberOf.includes(item.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }
}

export const getAuthorizedEvent = async <T extends JsonDogEvent = JsonDogEvent>(
  user: JsonUser,
  memberOf: string[],
  eventId: string
) => {
  const item = await getEvent<T>(eventId)
  assertEventOrganizerAccess(user, memberOf, item)
  return item
}

export const authorizeEvent = async <T extends JsonDogEvent = JsonDogEvent>(
  event: APIGatewayProxyEvent,
  getEventId: string | (() => string)
) => {
  const { user, memberOf, res } = await authorizeWithMemberOf(event)

  if (res) return { res }

  const eventId = typeof getEventId === 'function' ? getEventId() : getEventId
  const item = await getAuthorizedEvent<T>(user, memberOf, eventId)

  return { eventId, item, user }
}
