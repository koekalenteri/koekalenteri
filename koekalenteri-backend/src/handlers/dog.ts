import { metricScope, MetricsLogger } from 'aws-embedded-metrics'
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { AWSError } from 'aws-sdk'
import { BreedCode, JsonDog, JsonTestResult } from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'
import KLAPI from '../utils/KLAPI'
import { KLKieli } from '../utils/KLAPI_models'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'
import { getKLAPIConfig } from '../utils/secrets'

const dynamoDB = new CustomDynamoClient()

const klapi = new KLAPI(getKLAPIConfig)

const GENDER: Record<string, 'F' | 'M'> = {
  narttu: 'F',
  female: 'F',
  tik: 'F',
  uros: 'M',
  male: 'M',
  hane: 'M',
}

export const getDogHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const regNo = event.pathParameters?.regNo?.replace('~', '/')
        const refresh = event.queryStringParameters && 'refresh' in event.queryStringParameters

        let item = await dynamoDB.read<JsonDog>({ regNo })
        console.log('cached: ' + JSON.stringify(item))

        if (!item || refresh) {
          const { status, json, error } = await klapi.lueKoiranPerustiedot({
            Rekisterinumero: regNo,
            Kieli: KLKieli.Suomi,
          })

          if (status === 200 && json) {
            // Cache
            item = {
              ...item, // keep refined info on refres
              regNo: json.rekisterinumero,
              name: json.nimi,
              rfid: json.tunnistusmerkintä,
              breedCode: json.rotukoodi as BreedCode,
              dob: json.syntymäaika,
              gender: GENDER[json.sukupuoli],
              titles: json.tittelit,
              refreshDate: new Date().toISOString(),
            }

            // Luetaan koetulokset käyttäen palautettua rekisterinumeroa.
            // Jos koiralla on useampi rekkari, niin palautettu on se mille tulokset on kirjattu.
            const results = await klapi.lueKoiranKoetulokset({ Rekisterinumero: item.regNo, Kieli: KLKieli.Suomi })
            if (results.status === 200) {
              const res: JsonTestResult[] = []
              for (const result of results.json || []) {
                res.push({
                  type: result.koemuoto,
                  class: result.luokka,
                  date: result.aika,
                  result: result.tulos,
                  judge: result.tuomari,
                  location: result.paikkakunta,

                  ext: result.tarkenne,
                  notes: result.lisämerkinnät,
                  points: result.pisteet,
                  rank: result.sijoitus,

                  cert: result.lisämerkinnät.slice(0, 5).toLowerCase() === 'cert ',
                  resCert: result.lisämerkinnät.slice(0, 9).toLowerCase() === 'vara sert',
                })
              }
              item.results = res
            } else {
              console.error(JSON.stringify(results))
            }

            await dynamoDB.write(item)
          } else {
            metricsError(metrics, event.requestContext, 'getDog')
            return response(status, 'Upstream error: ' + error, event)
          }
        }

        metricsSuccess(metrics, event.requestContext, 'getDog')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getDog')
        return response((err as AWSError).statusCode || 501, err, event)
      }
    }
)
