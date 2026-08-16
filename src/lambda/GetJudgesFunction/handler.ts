import { CONFIG } from '../config'
import { fetchJudgesForEventTypes, updateJudges } from '../lib/judge'
import KLAPI from '../lib/KLAPI'
import { createOfficialDirectoryLambda } from '../lib/officialDirectory'
import { getKLAPIConfig } from '../lib/secrets'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { eventTypeTable, judgeTable } = CONFIG
// exported for testing
export const dynamoDB = new CustomDynamoClient(judgeTable)

export default createOfficialDirectoryLambda({
  collection: 'judges',
  dynamoDB,
  eventTypeTable,
  fetch: fetchJudgesForEventTypes,
  klapi: () => new KLAPI(getKLAPIConfig),
  role: 'judge',
  service: 'getJudges',
  update: updateJudges,
})
