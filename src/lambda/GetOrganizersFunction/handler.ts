import type { Organizer } from '../../types'
import { nanoid } from 'nanoid'
import { authorizeAdmin } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { addOrganizers, readOrganizers, renameOrganizer } from '../lib/repositories/organizerRepository'
import { getKLAPIConfig } from '../lib/secrets'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import { KLYhdistysRajaus } from '../types/KLAPI'

const refreshOrganizersLambda = lambda('refreshOrganizers', async (event) => {
  await authorizeAdmin(event)

  const klapi = new KLAPI(getKLAPIConfig)
  const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
  if (status === 200 && json) {
    const insert: Organizer[] = []
    const existing = await readOrganizers()
    for (const item of json) {
      const old = existing.find((org) => org.kcId === item.jäsennumero)
      if (!old) {
        const org: Organizer = { id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys }
        insert.push(org)
      } else if (old.name !== item.strYhdistys) {
        logger.info('organizer name changed', { kcId: old.kcId, name: item.strYhdistys, previous: old.name })
        await renameOrganizer(old.id, item.strYhdistys)
      }
    }
    if (insert.length) {
      await addOrganizers(insert)
    }
  }
  await publishAdminDataInvalidation(['organizers'])
  const items = await readOrganizers()

  return response(200, items, event)
})

const getOrganizersLambda = lambda('getOrganizers', async (event) => {
  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    return refreshOrganizersLambda(event)
  }

  const items = await readOrganizers()

  return response(200, items, event)
})

export default getOrganizersLambda
