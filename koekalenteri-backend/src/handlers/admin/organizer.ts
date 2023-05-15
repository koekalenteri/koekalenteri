import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { Organizer } from 'koekalenteri-shared/model'
import { nanoid } from 'nanoid'

import { authorize } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import KLAPI from '../../utils/KLAPI'
import { KLYhdistysRajaus } from '../../utils/KLAPI_models'
import { response } from '../../utils/response'
import { getKLAPIConfig } from '../../utils/secrets'

const dynamoDB = new CustomDynamoClient()
const klapi = new KLAPI(getKLAPIConfig)

export const refreshOrganizers = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const { status, json } = await klapi.lueYhdistykset({ Rajaus: KLYhdistysRajaus.Koejärjestätä })
  if (status === 200 && json) {
    const existing = await dynamoDB.readAll<Organizer>()
    for (const item of json) {
      const old = existing?.find((org) => org.kcId === item.jäsennumero)
      if (!old) {
        const org: Organizer = { id: nanoid(10), kcId: item.jäsennumero, name: item.strYhdistys }
        await dynamoDB.write(org)
      } else {
        if (old.name !== item.strYhdistys) {
          await dynamoDB.update(
            { id: old.id },
            'set #name = :name',
            {
              '#name': 'name',
            },
            {
              ':name': item.strYhdistys,
            }
          )
        }
      }
    }
  }
  const items = await dynamoDB.readAll()
  return response(200, items, event)
}
