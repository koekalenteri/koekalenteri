import type { JsonOfficial, Official } from '../../types'
import type KLAPI from './KLAPI'
import { KLKieli } from '../types/KLAPI'
import { fetchOfficialDirectory, mapOfficialDirectoryEntry, syncOfficialDirectory } from './officialDirectory'
import { readOfficials, writeOfficials } from './repositories/officialRepository'

export const fetchOfficialsForEventTypes = async (
  klapi: KLAPI,
  eventTypes: string[]
): Promise<Official[] | undefined> =>
  fetchOfficialDirectory(klapi, eventTypes, {
    errorContext: 'fetchOfficialsForEventTypes',
    errorLabel: 'officials',
    fetch: (client, eventType) => client.lueKoemuodonKoetoimitsijat({ Kieli: KLKieli.Suomi, Koemuoto: eventType }),
    map: mapOfficialDirectoryEntry,
  })

export const updateOfficials = (officials: Official[]): Promise<void> =>
  syncOfficialDirectory(officials, {
    create: (official, now): JsonOfficial => ({
      createdAt: now,
      createdBy: 'system',
      modifiedAt: now,
      modifiedBy: 'system',
      ...official,
    }),
    label: 'official',
    partialize: (official) => ({
      district: official.district,
      email: official.email,
      eventTypes: official.eventTypes,
      id: official.id,
      location: official.location,
      name: official.name,
      phone: official.phone,
    }),
    readAll: readOfficials,
    writeAll: writeOfficials,
  })
