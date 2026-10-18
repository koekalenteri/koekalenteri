import type { Location } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.locationTable)

/**
 * The whole municipality list lives in a single row. It is read on every /user call (through
 * dataVersions), which is by far the hottest lambda we have, so the version check has to be a
 * GetItem instead of a scan. ~300 municipalities is around 20kB, nowhere near the item limit,
 * and there is no incremental use case: nobody edits a municipality.
 */
const LOCATIONS_ID = 'fi'

export interface LocationSnapshot {
  count: number
  id: string
  items: Location[]
  modifiedAt: string
}

/** The municipality list as last written, or undefined before the first sync. */
export const readLocationSnapshot = async () => dynamoDB.read<LocationSnapshot>({ id: LOCATIONS_ID })

/** Replaces the municipality list. */
export const writeLocationSnapshot = async (snapshot: Omit<LocationSnapshot, 'id'>) => {
  await dynamoDB.write<LocationSnapshot>({ ...snapshot, id: LOCATIONS_ID })
}
