import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { EventType, JsonDbRecord, Official } from 'koekalenteri-shared/model'

import { diff } from 'deep-object-diff'

import { authorize, getAndUpdateUserByEmail } from '../../utils/auth'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import KLAPI from '../../utils/KLAPI'
import { KLKieli } from '../../utils/KLAPI_models'
import { response } from '../../utils/response'
import { getKLAPIConfig } from '../../utils/secrets'
import { capitalize, reverseName } from '../../utils/string'

const dynamoDB = new CustomDynamoClient()
const klapi = new KLAPI(getKLAPIConfig)

export const refreshOfficials = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const user = await authorize(event)
  if (!user?.admin) {
    return response(401, 'Unauthorized', event)
  }

  const eventTypeTable = process.env.EVENT_TYPE_TABLE_NAME || ''
  const eventTypes = (await dynamoDB.readAll<EventType>(eventTypeTable))?.filter((et) => et.active) || []
  for (const eventType of eventTypes) {
    const { status, json } = await klapi.lueKoemuodonKoetoimitsijat({
      Koemuoto: eventType.eventType,
      Kieli: KLKieli.Suomi,
    })
    if (status === 200 && json) {
      for (const item of json) {
        const existing = await dynamoDB.read<Official>({ id: item.jäsennumero })
        const name = capitalize(item.nimi)
        const location = capitalize(item.paikkakunta)
        const official = {
          ...existing,
          id: item.jäsennumero,
          name,
          location,
          district: item.kennelpiiri,
          email: item.sähköposti,
          phone: item.puhelin,
          eventTypes: item.koemuodot.map((koemuoto) => koemuoto.lyhenne),
          deletedAt: false,
          deletedBy: '',
        }
        if (!existing || Object.keys(diff(existing, official)).length > 0) {
          await dynamoDB.write(official)
        }
        await getAndUpdateUserByEmail(item.sähköposti, {
          name: reverseName(name),
          kcId: item.jäsennumero,
          officer: true,
          location,
          phone: item.puhelin,
        })
      }
    }
  }
  const items = (await dynamoDB.readAll<Official & JsonDbRecord>())?.filter((o) => !o.deletedAt)
  return response(200, items, event)
}
