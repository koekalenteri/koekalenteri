import type { JsonEventType } from '../../types'
import { authorizeAdmin } from '../lib/auth'
import { lambda, response } from '../lib/lambda'
import { readEventTypes, writeEventType } from '../lib/repositories/eventTypeRepository'
import { readJudges, writeJudges } from '../lib/repositories/judgeRepository'
import { readOfficials, writeOfficials } from '../lib/repositories/officialRepository'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import { createDbRecord } from '../utils/proxyEvent'

const putEventTypeLambda = lambda('putEventType', async (event) => {
  const user = await authorizeAdmin(event)

  const timestamp = new Date().toISOString()

  const item = createDbRecord<JsonEventType>(event, timestamp, user.name, false)
  await writeEventType(item)

  if (!item.active) {
    const active = (await readEventTypes()).filter((et) => et.active)
    const servesNoActiveType = (entry: { deletedAt?: string; eventTypes?: string[] }) =>
      !entry.deletedAt && !active.some((et) => entry.eventTypes?.includes(et.eventType))
    const deleted = { deletedAt: timestamp, deletedBy: user.name }

    const judgesToRemove = (await readJudges()).filter(servesNoActiveType)
    if (judgesToRemove.length) {
      await writeJudges(judgesToRemove.map((judge) => ({ ...judge, ...deleted })))
    }

    const officialsToRemove = (await readOfficials()).filter(servesNoActiveType)
    if (officialsToRemove.length) {
      await writeOfficials(officialsToRemove.map((official) => ({ ...official, ...deleted })))
    }
  }

  await publishAdminDataInvalidation(['eventTypes', 'judges', 'officials'])

  return response(200, item, event)
})

export default putEventTypeLambda
