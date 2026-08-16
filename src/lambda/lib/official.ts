import type { JsonOfficial, Official } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'
import { CONFIG } from '../config'
import { KLKieli } from '../types/KLAPI'
import { fetchOfficialDirectory, mapOfficialDirectoryEntry, syncOfficialDirectory } from './officialDirectory'

const { officialTable } = CONFIG

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

export const updateOfficials = (dynamoDB: CustomDynamoClient, officials: Official[]): Promise<void> =>
  syncOfficialDirectory(dynamoDB, officials, {
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
    table: officialTable,
  })
