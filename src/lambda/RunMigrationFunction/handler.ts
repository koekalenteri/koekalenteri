import type { JsonDogEvent } from '../../types'

import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { lambda } from '../lib/lambda'
import { response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const runMigrationLambda = lambda('runMigration', async (event) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const events = (await dynamoDB.readAll<JsonDogEvent>()) ?? []

  let count = 0

  for (const item of events) {
    if (!item.season) {
      item.season = item.startDate.substring(0, 4)
      await dynamoDB.write(item)
      count++
    }
  }

  return response(200, count, event)
})

export default runMigrationLambda
