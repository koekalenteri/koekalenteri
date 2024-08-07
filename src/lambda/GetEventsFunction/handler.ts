import type { JsonDogEvent } from '../../types'

import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import { lambda } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventsLambda = lambda('getEvents', async (event) => {
  const items = await dynamoDB.readAll<JsonDogEvent>()
  const publicItems = items?.filter((item) => item.state !== 'draft').map((item) => sanitizeDogEvent(item))

  return response(200, publicItems, event)
})

export default getEventsLambda
