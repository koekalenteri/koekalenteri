import type { JsonDogEvent } from '../../types'
import { sanitizeDogEvent } from '../../lib/event'
import { CONFIG } from '../config'
import { lambda, response } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

const getEventsLambda = lambda('getEvents', async (event) => {
  const items = await dynamoDB.readAll<JsonDogEvent>()
  let publicItems = items?.filter((item) => item.state !== 'draft').map((item) => sanitizeDogEvent(item)) ?? []

  const parseDateParam = (value: string | undefined): Date | undefined => {
    if (!value) return undefined
    const asNumber = Number(value)
    if (!Number.isFinite(asNumber)) return undefined
    const d = new Date(asNumber)
    return Number.isNaN(d.getTime()) ? undefined : d
  }

  const start = parseDateParam(event.queryStringParameters?.start)
  const end = parseDateParam(event.queryStringParameters?.end)
  const since = parseDateParam(event.queryStringParameters?.since)

  if (start || end || since) {
    publicItems = publicItems.filter((item) => {
      const eventStart = new Date(item.startDate)
      const eventEnd = item.endDate ? new Date(item.endDate) : eventStart
      if (start && eventEnd < start) return false
      if (end && eventStart > end) return false
      if (since) {
        const modifiedAt = (item as any).modifiedAt
        if (typeof modifiedAt !== 'string') return false
        const modifiedAtDate = new Date(modifiedAt)
        if (Number.isNaN(modifiedAtDate.getTime()) || modifiedAtDate < since) return false
      }
      return true
    })
  }

  return response(200, publicItems, event)
})

export default getEventsLambda
