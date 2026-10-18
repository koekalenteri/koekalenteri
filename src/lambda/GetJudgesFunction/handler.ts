import { fetchJudgesForEventTypes, updateJudges } from '../lib/judge'
import KLAPI from '../lib/KLAPI'
import { createOfficialDirectoryLambda } from '../lib/officialDirectory'
import { readJudges } from '../lib/repositories/judgeRepository'
import { getKLAPIConfig } from '../lib/secrets'
import { publishAdminDataInvalidation } from '../lib/ws/actions'

export default createOfficialDirectoryLambda({
  collection: 'judges',
  fetch: fetchJudgesForEventTypes,
  klapi: () => new KLAPI(getKLAPIConfig),
  onRefreshed: publishAdminDataInvalidation,
  readAll: readJudges,
  role: 'judge',
  service: 'getJudges',
  update: updateJudges,
})
