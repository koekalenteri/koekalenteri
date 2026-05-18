import type { Organizer } from '../../types'
import { authorize } from '../auth/api'
import { parseJSONWithFallback } from '../lib/json'
import { lambda, response } from '../lib/lambda'
import { organizerRepository } from '../organizer/repository'

export const putOrganizerLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const item: Partial<Organizer> = parseJSONWithFallback(event.body)

  if (!item.id) {
    return response(400, 'no data', event)
  }

  const existing = await organizerRepository.getById(item.id)
  const updated = { ...(existing ?? {}), ...item, id: item.id } as Organizer

  await organizerRepository.write(updated)

  return response(200, updated, event)
}

export default lambda('putOrganizer', putOrganizerLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
