// Despite its deployed name, this manual function regenerates stats by deleting and replaying them.
import type { JsonConfirmedEvent } from '../../types'
import type { RegistrationStatsInput } from '../lib/stats'
import { CONFIG } from '../config'
import { eventStatsYear, updateEventStatsForRegistration } from '../lib/stats'
import CustomDynamoClient from '../utils/CustomDynamoClient'

interface EventStatKey {
  PK: string
  SK: string
}

interface RegistrationWithEvent {
  event: JsonConfirmedEvent
  registration: RegistrationStatsInput
}

const DELETE_CONCURRENCY = 10
const REPLAY_CONCURRENCY = 10
const REGISTRATION_STATS_PROJECTION_NAMES = { '#handler': 'handler', '#owner': 'owner' }
type RegistrationStatsScalarField = Exclude<keyof RegistrationStatsInput, 'dog' | 'handler' | 'owner'>
type RegistrationStatsNestedField<Field extends 'dog' | 'handler' | 'owner'> =
  `${Field}.${keyof NonNullable<RegistrationStatsInput[Field]> & string}`
type RegistrationStatsProjectionField =
  | RegistrationStatsScalarField
  | RegistrationStatsNestedField<'dog'>
  | RegistrationStatsNestedField<'handler'>
  | RegistrationStatsNestedField<'owner'>

const REGISTRATION_STATS_PROJECTION_FIELDS = [
  'eventId',
  'id',
  'cancelled',
  'paidAmount',
  'refundAmount',
  'eventType',
  'dog.regNo',
  'dog.breedCode',
  'handler.email',
  'owner.email',
] as const satisfies readonly RegistrationStatsProjectionField[]

const REGISTRATION_STATS_PROJECTION = REGISTRATION_STATS_PROJECTION_FIELDS.map((field) =>
  field.replace(/^(handler|owner)(?=\.)/, '#$1')
).join(', ')

const dynamoDB = new CustomDynamoClient(CONFIG.eventStatsTable)

/** Returns the year represented by a stats-table key, if it is a stats record. */
export function getEventStatsRecordYear({ PK, SK }: EventStatKey): number | undefined {
  const match =
    /^(?:STAT|TOTALS|BUCKETS)#(\d{4})(?:#|$)/.exec(PK) || (PK === 'YEARS' ? /^(\d{4})$/.exec(SK) : undefined)
  if (match) return Number(match[1])

  if (PK.startsWith('ORG#')) {
    const eventIdSeparator = SK.indexOf('#')
    return eventIdSeparator === -1 ? undefined : eventStatsYear({ startDate: SK.slice(0, eventIdSeparator) })
  }

  return undefined
}

async function deleteStatsRecords(stats: EventStatKey[]): Promise<void> {
  for (let start = 0; start < stats.length; start += DELETE_CONCURRENCY) {
    await Promise.all(
      stats.slice(start, start + DELETE_CONCURRENCY).map(async (stat) => {
        if (!(await dynamoDB.delete({ PK: stat.PK, SK: stat.SK }))) {
          throw new Error(`Failed to delete stats record ${stat.PK}/${stat.SK}`)
        }
      })
    )
  }
}

async function replayRegistrations(
  registrations: RegistrationWithEvent[],
  updateStats: typeof updateEventStatsForRegistration
): Promise<void> {
  for (let start = 0; start < registrations.length; start += REPLAY_CONCURRENCY) {
    await Promise.all(
      registrations.slice(start, start + REPLAY_CONCURRENCY).map(({ event, registration }) => {
        return updateStats(registration, undefined, event)
      })
    )
  }
}

export function createHandler(updateStats: typeof updateEventStatsForRegistration = updateEventStatsForRegistration) {
  return async function handler(): Promise<void> {
    console.log('Starting event stats regeneration...')

    const allEvents = (await dynamoDB.readAll<JsonConfirmedEvent>({ table: CONFIG.eventTable })) || []
    const registrations =
      (await dynamoDB.readAll<RegistrationStatsInput>({
        names: REGISTRATION_STATS_PROJECTION_NAMES,
        projection: REGISTRATION_STATS_PROJECTION,
        table: CONFIG.registrationTable,
      })) || []
    const allStatKeys = (await dynamoDB.readAll<EventStatKey>({ projection: 'PK, SK' })) || []
    const eventsById = new Map(allEvents.map((event) => [event.id, event]))
    const statsByYear = new Map<number, EventStatKey[]>()
    const registrationsByYear = new Map<number, RegistrationWithEvent[]>()
    const years = new Set<number>()
    let skippedCount = 0
    let unclassifiedStatsCount = 0

    for (const event of allEvents) {
      const year = eventStatsYear(event)
      if (year === undefined) continue
      years.add(year)
    }

    for (const stat of allStatKeys) {
      const year = getEventStatsRecordYear(stat)
      if (year === undefined) {
        unclassifiedStatsCount++
        continue
      }
      years.add(year)
      const stats = statsByYear.get(year) || []
      stats.push(stat)
      statsByYear.set(year, stats)
    }

    for (const registration of registrations) {
      const event = eventsById.get(registration.eventId)
      const year = event && eventStatsYear(event)
      if (!event || year === undefined) {
        console.log(`Skipping registration ${registration.id}: event is missing or has an invalid start date`)
        skippedCount++
        continue
      }

      const registrationsForYear = registrationsByYear.get(year) || []
      registrationsForYear.push({ event, registration })
      registrationsByYear.set(year, registrationsForYear)
    }

    const sortedYears = [...years].sort((a, b) => a - b)
    console.log(
      `Found ${allEvents.length} events, ${registrations.length} registrations, ${allStatKeys.length} stats records, and ${sortedYears.length} years`
    )

    for (const year of sortedYears) {
      // This regeneration is delete-then-replay: if it fails, invoke it again to completion.
      const statsForYear = statsByYear.get(year) || []
      await deleteStatsRecords(statsForYear)
      const registrationsForYear = registrationsByYear.get(year) || []
      await replayRegistrations(registrationsForYear, updateStats)
      console.log(
        `Regenerated ${year}: removed ${statsForYear.length} existing stats and processed ${registrationsForYear.length} registrations`
      )
    }

    console.log(
      `Event stats regeneration completed. Years: ${sortedYears.length}, Skipped: ${skippedCount}, Unclassified stats: ${unclassifiedStatsCount}`
    )
  }
}

export default createHandler()
