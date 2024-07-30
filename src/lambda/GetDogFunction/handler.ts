import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { BreedCode, JsonDog, JsonTestResult } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { differenceInMinutes } from 'date-fns'
import { unescape } from 'querystring'

import { CONFIG } from '../config'
import KLAPI from '../lib/KLAPI'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { metricsError, metricsSuccess } from '../utils/metrics'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.dogTable)

const GENDER: Record<string, 'F' | 'M'> = {
  narttu: 'F',
  female: 'F',
  tik: 'F',
  uros: 'M',
  male: 'M',
  hane: 'M',
}

const getDogHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const regNo = unescape(event.pathParameters?.regNo?.replace('~', '/') ?? '')

        let item = await dynamoDB.read<JsonDog>({ regNo })
        const itemAge = item?.refreshDate ? differenceInMinutes(new Date(), new Date(item.refreshDate)) : 0

        const refresh = (event.queryStringParameters && 'refresh' in event.queryStringParameters) || itemAge > 60

        console.log('cached: ' + JSON.stringify(item))
        console.log(`itemAge: ${itemAge}, refresh: ${refresh}`)

        if (!item || refresh) {
          const klapi = new KLAPI(getKLAPIConfig)
          const { status, json, error } = await klapi.lueKoiranPerustiedot({
            Rekisterinumero: regNo,
            Kieli: KLKieli.Suomi,
          })

          if (status === 200 && json?.rekisterinumero) {
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
                const notes = result.lisämerkinnät.toLocaleLowerCase().trim()
                const resCert = /vara[ -]sert/.test(notes)
                const cert = !resCert && /sert/.test(notes)
                const resCacit = /vara[ -]]cacit/.test(notes)
                const cacit = !resCacit && /cacit/.test(notes)
                res.push({
                  type: result.koemuoto,
                  subType: result.tapahtumanTyyppi,
                  class: result.luokka,
                  date: result.aika,
                  result: result.tulos,
                  judge: result.tuomari,
                  location: result.paikkakunta,

                  ext: result.tarkenne,
                  notes: result.lisämerkinnät,
                  points: result.pisteet,
                  rank: result.sijoitus,

                  cert,
                  resCert,
                  cacit,
                  resCacit,
                })
              }
              item.results = res
            } else {
              console.error('lueKoiranKoetulokset failed: ', JSON.stringify(results))
            }

            await dynamoDB.write(item)
          } else {
            console.error('lueKoiranPerustiedot failed: ', status, json, error)
            if (!item) {
              metricsError(metrics, event.requestContext, 'getDog')
              return response(status, 'Upstream error: ' + error, event)
            }
            if (status === 404 && error === 'diseased') {
              await dynamoDB.delete({ regNo })
              metricsError(metrics, event.requestContext, 'getDog')
              return response(status, 'Upstream error: ' + error, event)
            }
          }
        }

        metricsSuccess(metrics, event.requestContext, 'getDog')
        return response(200, item, event)
      } catch (err) {
        console.error(err)
        metricsError(metrics, event.requestContext, 'getDog')
        return response((err as AWSError).statusCode ?? 501, err, event)
      }
    }
)

export default getDogHandler
