import type { JsonDogEvent } from '../../types'

import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventsLambda = lambda('getEvents', async (event) => {
  const items = await dynamoDB.readAll<JsonDogEvent>()
  let publicItems = items?.filter((item) => item.state !== 'draft').map((item) => sanitizeDogEvent(item)) ?? []

  const start = event.queryStringParameters?.start ? new Date(event.queryStringParameters.start) : undefined
  const end = event.queryStringParameters?.end ? new Date(event.queryStringParameters.end) : undefined

  if (start || end) {
    publicItems = publicItems.filter((item) => {
      const eventStart = new Date(item.startDate)
      const eventEnd = item.endDate ? new Date(item.endDate) : eventStart
      if (start && eventEnd < start) return false
      if (end && eventStart > end) return false
      return true
    })
  }

  return response(200, publicItems, event)
})

export default getEventsLambda
