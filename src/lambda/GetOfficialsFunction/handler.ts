import { CONFIG } from '../config'
import KLAPI from '../lib/KLAPI'
import { fetchOfficialsForEventTypes, updateOfficials } from '../lib/official'
import { createOfficialDirectoryLambda } from '../lib/officialDirectory'
import { getKLAPIConfig } from '../lib/secrets'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTypeTable, officialTable } = CONFIG
// exported for testing
export const dynamoDB = new CustomDynamoClient(officialTable)

export default createOfficialDirectoryLambda({
  collection: 'officials',
  dynamoDB,
  eventTypeTable,
  fetch: fetchOfficialsForEventTypes,
  klapi: () => new KLAPI(getKLAPIConfig),
  role: 'officer',
  service: 'getOfficials',
  update: updateOfficials,
})
