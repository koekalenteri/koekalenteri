import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import type { AWSError } from 'aws-sdk'
import type { BreedCode, JsonDog, JsonTestResult } from '../../types'

import { metricScope } from 'aws-embedded-metrics'
import { differenceInMinutes } from 'date-fns'

import { CONFIG } from '../config'
import { getParam } from '../lib/apigw'
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

const readDogResultsFromKlapi = async (klapi: KLAPI, regNo: string): Promise<JsonTestResult[]> => {
  // Luetaan koetulokset käyttäen palautettua rekisterinumeroa.
  // Jos koiralla on useampi rekkari, niin palautettu on se mille tulokset on kirjattu.
  const apiResult = await klapi.lueKoiranKoetulokset({ Rekisterinumero: regNo, Kieli: KLKieli.Suomi })

  if (apiResult.status !== 200) {
    console.error('lueKoiranKoetulokset failed', JSON.stringify(apiResult))

    return []
  }

  const results: JsonTestResult[] = []

  for (const result of apiResult.json || []) {
    const notes = result.lisämerkinnät.toLocaleLowerCase().trim()
    const resCert = /vara[ -]sert/.test(notes)
    const cert = !resCert && /sert/.test(notes)
    const resCacit = /vara[ -]]cacit/.test(notes)
    const cacit = !resCacit && /cacit/.test(notes)

    results.push({
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

  return results
}

const readDogFromKlapi = async (regNo: string, existing?: JsonDog) => {
  const klapi = new KLAPI(getKLAPIConfig)
  const { status, json, error } = await klapi.lueKoiranPerustiedot({
    Rekisterinumero: regNo,
    Kieli: KLKieli.Suomi,
  })

  let dog = existing

  if (status === 200 && json?.rekisterinumero) {
    // Cache
    dog = {
      ...existing, // keep refined info on refres
      breedCode: json.rotukoodi as BreedCode,
      dob: json.syntymäaika,
      gender: GENDER[json.sukupuoli],
      kcId: json.id,
      name: json.nimi,
      refreshDate: new Date().toISOString(),
      regNo: json.rekisterinumero,
      rfid: json.tunnistusmerkintä,
      titles: json.tittelit,
    }

    dog.results = await readDogResultsFromKlapi(klapi, dog.regNo)
  } else {
    console.error('lueKoiranPerustiedot failed', { status, json, error })
  }

  return { dog, status, error }
}

const getDogHandler = metricScope(
  (metrics: MetricsLogger) =>
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
      try {
        const regNo = getParam(event, 'regNo').replace('~', '/')

        let item = await dynamoDB.read<JsonDog>({ regNo })

        const itemAge = item?.refreshDate ? differenceInMinutes(new Date(), new Date(item.refreshDate)) : 0
        const refresh = (event.queryStringParameters && 'refresh' in event.queryStringParameters) || itemAge > 60

        console.log('cached: ' + JSON.stringify(item))
        console.log(`itemAge: ${itemAge}, refresh: ${refresh}`)

        if (!item || refresh) {
          const { dog, status, error } = await readDogFromKlapi(regNo, item)

          if (!dog) {
            metricsError(metrics, event.requestContext, 'getDog')
            return response(status, 'Upstream error: ' + error, event)
          }

          if (status === 404 && error === 'diseased') {
            await dynamoDB.delete({ regNo })
            metricsError(metrics, event.requestContext, 'getDog')
            return response(status, 'Upstream error: ' + error, event)
          }

          await dynamoDB.write(dog)

          item = dog
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
