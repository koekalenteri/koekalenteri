import KLAPI from '../lib/KLAPI'
import { fetchOfficialsForEventTypes, updateOfficials } from '../lib/official'
import { createOfficialDirectoryLambda } from '../lib/officialDirectory'
import { readOfficialsIncludingDeleted } from '../lib/repositories/officialRepository'
import { getKLAPIConfig } from '../lib/secrets'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

export default createOfficialDirectoryLambda({
  collection: 'officials',
  fetch: fetchOfficialsForEventTypes,
  klapi: () => new KLAPI(getKLAPIConfig),
  onRefreshed: publishAdminDataInvalidation,
  readAll: readOfficialsIncludingDeleted,
  role: 'officer',
  service: 'getOfficials',
  update: updateOfficials,
})
