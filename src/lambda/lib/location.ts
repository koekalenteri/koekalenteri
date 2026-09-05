import type { Location } from '../../types'
import type { KLPaikkakunta } from '../types/KLAPI'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'
import { capitalize } from '../../lib/string'
import { logger } from './log'

/**
 * The whole municipality list lives in a single row. It is read on every /user call (through
 * dataVersions), which is by far the hottest lambda we have, so the version check has to be a
 * GetItem instead of a scan. ~300 municipalities is around 20kB, nowhere near the item limit,
 * and there is no incremental use case: nobody edits a municipality.
 */
export const LOCATIONS_ID = 'fi'

/** Only the calls this module makes, so a test double is a plain object rather than a cast. */
type LocationApi = Pick<KLAPI, 'lueKennelpiirit' | 'luePaikkakunnat'>
type LocationStore = Pick<CustomDynamoClient, 'read' | 'write'>

interface LocationSnapshot {
  count: number
  id: string
  items: Location[]
  modifiedAt: string
}

const mapLocation = (item: KLPaikkakunta): Location => ({
  district: capitalize(item.kennelpiiri),
  id: item.paikkakuntaNumero,
  name: capitalize(item.paikkakunta),
})

/**
 * Keyed by name, not by number: KL numbers the municipalities within the kennelpiiri, so the same
 * number comes back once per district. The name is the identity the option list needs anyway, and
 * a municipality listed under two districts is one option to the person filling in the form.
 */
const collectLocations = (entries: Map<string, Location>, items: KLPaikkakunta[]) => {
  for (const item of items) {
    if (!item.paikkakunta) continue
    const location = mapLocation(item)
    const key = location.name.toLocaleLowerCase('fi')
    if (!entries.has(key)) entries.set(key, location)
  }
}

const sortLocations = (locations: Location[]) => locations.sort((a, b) => a.name.localeCompare(b.name, 'fi'))

export const fetchLocations = async (klapi: LocationApi): Promise<Location[] | undefined> => {
  const entries = new Map<string, Location>()

  // KennelpiirinNumero is optional in the KL API, but the district-less call has never been made in
  // anger. When it comes back empty, fall back to looping the districts the way the official
  // directory loops event types.
  const all = await klapi.luePaikkakunnat({})
  if (all.status === 200 && all.json?.length) {
    collectLocations(entries, all.json)
    return sortLocations([...entries.values()])
  }
  logger.warn('luePaikkakunnat returned nothing without a district, falling back to per district', {
    error: all.error,
    status: all.status,
  })

  const districts = await klapi.lueKennelpiirit()
  if (districts.status !== 200 || !districts.json?.length) {
    logger.error('fetchLocations: failed to fetch districts, aborting', {
      error: districts.error,
      status: districts.status,
    })
    return undefined
  }

  for (const district of districts.json) {
    const { status, json, error } = await klapi.luePaikkakunnat({ KennelpiirinNumero: district.numero })
    if (status !== 200 || !json) {
      logger.error('fetchLocations: failed to fetch locations for district, aborting', {
        district: district.numero,
        error,
        status,
      })
      return undefined
    }
    collectLocations(entries, json)
  }

  return entries.size ? sortLocations([...entries.values()]) : undefined
}

export const getLocationSnapshot = (dynamoDB: LocationStore) => dynamoDB.read<LocationSnapshot>({ id: LOCATIONS_ID })

/**
 * Writes the snapshot only when the list actually changed: an unchanged modifiedAt is what keeps
 * every browser from refetching the list after a sync that found nothing new.
 *
 * @returns true when the snapshot was written
 */
export const syncLocations = async (dynamoDB: LocationStore, locations: Location[]): Promise<boolean> => {
  if (!locations.length) return false

  const existing = await getLocationSnapshot(dynamoDB)
  if (existing?.items && JSON.stringify(existing.items) === JSON.stringify(locations)) {
    logger.info('locations unchanged, not writing', { count: locations.length })
    return false
  }

  logger.info('writing locations', { count: locations.length, previously: existing?.count ?? 0 })
  await dynamoDB.write<LocationSnapshot>({
    count: locations.length,
    id: LOCATIONS_ID,
    items: locations,
    modifiedAt: new Date().toISOString(),
  })

  return true
}
