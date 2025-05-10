import type { JsonConfirmedEvent, JsonRegistration } from '../../types'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Single global client for all DynamoDB operations
const dynamoDB = new CustomDynamoClient(CONFIG.eventTable)

export default async function handler(): Promise<void> {
  // Read all registrations from the registration table
  const registrations = (await dynamoDB.readAll<JsonRegistration>(CONFIG.registrationTable)) || []

  type Stats = {
    organizerId: string
    eventId: string
    eventName: string
    eventStartDate: string
    eventEndDate: string
    totalRegistrations: number
    paidRegistrations: number
    cancelledRegistrations: number
    refundedRegistrations: number
    paidAmount: number
    refundedAmount: number
    updatedAt: string
  }

  const statsMap: Record<string, Stats> = {}

  for (const reg of registrations) {
    // Read event from the event table
    const evt = await dynamoDB.read<JsonConfirmedEvent>({ id: reg.eventId }, CONFIG.eventTable)
    if (!evt) continue
    const organizerId = evt.organizer.id
    const key = `${organizerId}:${evt.id}`

    let stats = statsMap[key]
    if (!stats) {
      stats = {
        organizerId,
        eventId: evt.id,
        eventName: evt.name,
        eventStartDate: evt.startDate,
        eventEndDate: evt.endDate,
        totalRegistrations: 0,
        paidRegistrations: 0,
        cancelledRegistrations: 0,
        refundedRegistrations: 0,
        paidAmount: 0,
        refundedAmount: 0,
        updatedAt: new Date().toISOString(),
      }
      statsMap[key] = stats
    }

    stats.totalRegistrations++
    if (reg.paidAmount) {
      stats.paidRegistrations++
      stats.paidAmount += reg.paidAmount
    }
    if (reg.cancelled) {
      stats.cancelledRegistrations++
    }
    if (reg.refundAmount) {
      stats.refundedRegistrations++
      stats.refundedAmount += reg.refundAmount
    }
    stats.updatedAt = new Date().toISOString()
  }

  // Write stats to the organizer event stats table
  for (const stats of Object.values(statsMap)) {
    await dynamoDB.write(stats, CONFIG.organizerEventStatsTable)
  }
}
