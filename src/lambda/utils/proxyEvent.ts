import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonDbRecord } from '../../types'

import { nanoid } from 'nanoid'

import { CONFIG } from '../config'
import { parseJSONWithFallback } from '../lib/json'

const { stageName } = CONFIG

export const getApiHost = (event: APIGatewayProxyEvent) => `${event.headers.Host ?? ''}/${stageName}`

export const createDbRecord = <T extends JsonDbRecord>(
  event: APIGatewayProxyEvent,
  timestamp: string,
  username: string
): T => {
  const baseRecord: Partial<JsonDbRecord> = {
    createdAt: timestamp,
    createdBy: username,
  }
  const item: T = {
    ...baseRecord,
    ...parseJSONWithFallback(event.body),
    modifiedAt: timestamp,
    modifiedBy: username,
  }
  if (!item.id) {
    item.id = nanoid(10)
  }

  return item
}
