import type { JsonEventType, Organizer } from '../../types'
import type { KcIdLookupCriteria } from '../lib/kcTrial'
import { getEventSeason, isOfficialEventType } from '../../lib/event'
import { kcFormatOfEventType } from '../../lib/kennelliittoResults'
import { CONFIG } from '../config'
import { authorizeWithMemberOf } from '../lib/auth'
import { parseJSONWithFallback } from '../lib/json'
import { getKLIntegraatio } from '../lib/KLIntegraatio'
import { searchKcTrials } from '../lib/kcTrial'
import { LambdaError, lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const isLookupCriteria = (value: Partial<KcIdLookupCriteria>): value is KcIdLookupCriteria =>
  Boolean(value.organizer?.id && value.classes && value.endDate && value.eventType && value.startDate)

const searchEventKcIdChoicesLambda = lambda('searchEventKcIdChoices', async (event) => {
  const { user, memberOf } = await authorizeWithMemberOf(event)

  const criteria = parseJSONWithFallback<Partial<KcIdLookupCriteria>>(event.body)
  if (!isLookupCriteria(criteria)) {
    throw new LambdaError(400, 'Organizer ID, event type, classes, start date, and end date are required')
  }
  if (!getEventSeason(criteria.startDate) || !getEventSeason(criteria.endDate)) {
    throw new LambdaError(400, 'Start date and end date must be valid dates')
  }

  if (!user.admin && !memberOf.includes(criteria.organizer.id)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const eventType = await dynamoDB.read<JsonEventType>(
    { eventType: kcFormatOfEventType(criteria.eventType) },
    CONFIG.eventTypeTable
  )

  // Only official event types have a Kennelliitto trial to find. A past event is deliberately not
  // refused (the KOE-85 gate used to): the lookup's own use case is results entry (KOE-452), which
  // happens the evening after the event, or days later.
  if (!isOfficialEventType(criteria.eventType, eventType?.official)) {
    throw new LambdaError(403, 'Forbidden')
  }

  const organizer = await dynamoDB.read<Organizer>({ id: criteria.organizer.id }, CONFIG.organizerTable)
  if (!organizer?.kcId) {
    throw new LambdaError(400, 'Event organizer does not have Kennel Club ID')
  }

  const choices = await searchKcTrials(getKLIntegraatio(), criteria, organizer.kcId)

  return response(200, { choices }, event)
})

export default searchEventKcIdChoicesLambda
