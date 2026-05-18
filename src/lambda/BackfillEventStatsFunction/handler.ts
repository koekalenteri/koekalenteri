import { eventRepository } from '../event/repository'
import { recordRegistrationChange } from '../stats/api'

export default async function handler(): Promise<void> {
  console.log('Starting backfill of event stats...')

  // Read all registrations from the registration table
  const registrations = (await eventRepository.listAllRegistrations()) || []
  console.log(`Found ${registrations.length} registrations to process`)

  // Read all events into memory first for efficiency
  const allEvents = (await eventRepository.listAllConfirmed()) || []
  console.log(`Found ${allEvents.length} events`)

  // Create a map of eventId -> event for quick lookup
  const eventMap = new Map<string, (typeof allEvents)[number]>()
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

      // Pass previous as undefined since this is a backfill.
      await recordRegistrationChange({ event: evt, next: reg, previous: undefined })
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
