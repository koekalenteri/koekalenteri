import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import { updateEventStatsForRegistration } from '../lib/stats'
import CustomDynamoClient from '../utils/CustomDynamoClient'

// Single global client for all DynamoDB operations
const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

export default async function handler(): Promise<void> {
  console.log('Starting backfill of event stats...')

  // Read all registrations from the registration table
  const registrations = (await dynamoDB.readAll<JsonRegistration>(CONFIG.registrationTable)) || []
  console.log(`Found ${registrations.length} registrations to process`)

  // Read all events into memory first for efficiency
  const allEvents = (await dynamoDB.readAll<JsonConfirmedEvent>(CONFIG.eventTable)) || []
  console.log(`Found ${allEvents.length} events`)

  // Create a map of eventId -> event for quick lookup
  const eventMap = new Map<string, JsonConfirmedEvent>()
  for (const event of allEvents) {
    eventMap.set(event.id, event)
  }

  // Process each registration
  let processedCount = 0
  let skippedCount = 0

  for (const reg of registrations) {
    try {
      // Get event from the map
      const evt = eventMap.get(reg.eventId)
      if (!evt) {
        console.log(`Event not found for registration ${reg.id}, eventId: ${reg.eventId}`)
        skippedCount++
        continue
      }

      // Use the updateEventStatsForRegistration function to update all stat types
      // Pass undefined as existingRegistration since this is a backfill
      await updateEventStatsForRegistration(reg, undefined, evt)
      processedCount++

      // Log progress every 100 registrations
      if (processedCount % 100 === 0) {
        console.log(`Processed ${processedCount} registrations...`)
      }
    } catch (error) {
      console.error(`Error processing registration ${reg.id}:`, error)
      skippedCount++
    }
  }

  console.log(`Backfill completed. Processed: ${processedCount}, Skipped: ${skippedCount}`)
}
