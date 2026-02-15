import type { Organizer } from '../../types'
import { nanoid } from 'nanoid'
import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { KLYhdistysRajaus } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

const refreshOrganizersLambda = lambda('refreshOrganizers', async (event) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const klapi = new KLAPI(getKLAPIConfig)
  const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
  if (status === 200 && json) {
    const insert: Organizer[] = []
    const existing = await dynamoDB.readAll<Organizer>()
    for (const item of json) {
      const old = existing?.find((org) => org.kcId === item.jäsennumero)
      if (!old) {
        const org: Organizer = { id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys }
        insert.push(org)
      } else if (old.name !== item.strYhdistys) {
        console.log(`Organizer ${old.kcId} name changed from ${old.name} to ${item.strYhdistys}`, old, item)
        await dynamoDB.update(
          { id: old.id },
          {
            set: {
              name: item.strYhdistys,
            },
          }
        )
      }
    }
    if (insert.length) {
      await dynamoDB.batchWrite(insert)
    }
  }
  const items = await dynamoDB.readAll<Organizer>()

  return response(200, items, event)
})

const getOrganizersLambda = lambda('getOrganizers', async (event) => {
  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    return refreshOrganizersLambda(event)
  }

  const items = await dynamoDB.readAll<Organizer>()

  return response(200, items, event)
})

export default getOrganizersLambda
