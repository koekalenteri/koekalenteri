import type { Organizer } from '../../types'
import type { KLYhdistys } from '../types/KLAPI'
import { nanoid } from 'nanoid'
import { mapWithConcurrency } from '../../lib/utils'
import { authorizeAdmin } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { addOrganizers, readOrganizers, renameOrganizer } from '../lib/repositories/organizerRepository'
import { getKLAPIConfig } from '../lib/secrets'
import { publishAdminDataInvalidation } from '../lib/ws/actions'
import { KLYhdistysRajaus } from '../types/KLAPI'

/** Renames are independent single-row updates; a few at a time keep the refresh short. */
const RENAME_CONCURRENCY = 5

interface Rename {
  organizer: Organizer
  name: string
}

/** Which organizers the Kennel Club reports that the table lacks, and which it reports under a new name. */
const compareWithKennelClub = (existing: Organizer[], reported: KLYhdistys[]) => {
  const insert: Organizer[] = []
  const renames: Rename[] = []
  for (const item of reported) {
    const old = existing.find((org) => org.kcId === item.jäsennumero)
    if (!old) {
      insert.push({ id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys })
    } else if (old.name !== item.strYhdistys) {
      renames.push({ name: item.strYhdistys, organizer: old })
    }
  }
  return { insert, renames }
}

const refreshOrganizersLambda = lambda('refreshOrganizers', async (event) => {
  await authorizeAdmin(event)

  const klapi = new KLAPI(getKLAPIConfig)
  const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
  if (status === 200 && json) {
    const { insert, renames } = compareWithKennelClub(await readOrganizers(), json)
    await mapWithConcurrency(renames, RENAME_CONCURRENCY, async ({ organizer, name }) => {
      logger.info('organizer name changed', { kcId: organizer.kcId, name, previous: organizer.name })
      await renameOrganizer(organizer.id, name)
    })
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
