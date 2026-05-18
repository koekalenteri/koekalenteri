import type { Organizer } from '../../types'
import { nanoid } from 'nanoid'
import { authorize } from '../auth/api'
import KLAPI from '../lib/KLAPI'
import { lambda, response } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { organizerRepository } from '../organizer/repository'
import { KLYhdistysRajaus } from '../types/KLAPI'

export const refreshOrganizersLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const klapi = new KLAPI(getKLAPIConfig)
  const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
  if (status === 200 && json) {
    const insert: Organizer[] = []
    const existing = await organizerRepository.list()
    for (const item of json) {
      const old = existing?.find((org) => org.kcId === item.jäsennumero)
      if (!old) {
        const org: Organizer = { id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys }
        insert.push(org)
      } else if (old.name !== item.strYhdistys) {
        console.log(`Organizer ${old.kcId} name changed from ${old.name} to ${item.strYhdistys}`, old, item)
        await organizerRepository.updateName(old.id, item.strYhdistys)
      }
    }
    if (insert.length) {
      await organizerRepository.batchWrite(insert)
    }
  }
  const items = await organizerRepository.list()

  return response(200, items, event)
}

export const getOrganizersLambda = async (event: APIGatewayProxyEvent) => {
  if (event.queryStringParameters && 'refresh' in event.queryStringParameters) {
    return refreshOrganizersLambda(event)
  }

  const items = await organizerRepository.list()

  return response(200, items, event)
}

export default lambda('getOrganizers', getOrganizersLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
