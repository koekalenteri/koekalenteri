import type { JsonJudge, Judge, RequireAllKeys } from '../../types'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import type KLAPI from './KLAPI'
import { CONFIG } from '../config'
import { KLKieli } from '../types/KLAPI'
import { fetchOfficialDirectory, mapOfficialDirectoryEntry, syncOfficialDirectory } from './officialDirectory'

const { judgeTable } = CONFIG

export type PartialJsonJudge = Omit<Judge, 'languages' | 'active'>

export const fetchJudgesForEventTypes = async (
  klapi: KLAPI,
  eventTypes: string[]
): Promise<PartialJsonJudge[] | undefined> =>
  fetchOfficialDirectory(klapi, eventTypes, {
    errorContext: 'fetchJudgesForEventTypes',
    errorLabel: 'judges',
    fetch: (client, eventType) => client.lueKoemuodonYlituomarit({ Kieli: KLKieli.Suomi, Koemuoto: eventType }),
    map: (item) => ({ ...mapOfficialDirectoryEntry(item), official: true }),
  })

export const partializeJudge = (judge: JsonJudge): RequireAllKeys<PartialJsonJudge> => ({
  district: judge.district,
  email: judge.email,
  eventTypes: judge.eventTypes,
  id: judge.id,
  location: judge.location,
  name: judge.name,
  official: judge.official,
  phone: judge.phone,
})

export const updateJudges = (dynamoDB: CustomDynamoClient, judges: PartialJsonJudge[]): Promise<void> =>
  syncOfficialDirectory(dynamoDB, judges, {
    create: (judge, now): JsonJudge => ({
      active: true,
      createdAt: now,
      createdBy: 'system',
      languages: [],
      modifiedAt: now,
      modifiedBy: 'system',
      ...judge,
    }),
    label: 'judge',
    partialize: partializeJudge,
    table: judgeTable,
  })
