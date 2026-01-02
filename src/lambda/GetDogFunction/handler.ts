import type { BreedCode, JsonDog, JsonTestResult } from '../../types'

import { differenceInMinutes } from 'date-fns'

import { CONFIG } from '../config'
import KLAPI from '../lib/KLAPI'
import { getParam, lambda, LambdaError, response } from '../lib/lambda'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli } from '../types/KLAPI'
import CustomDynamoClient from '../utils/CustomDynamoClient'

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
    const resCacit = /vara[ -]cacit/.test(notes)
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

    try {
      dog.results = await readDogResultsFromKlapi(klapi, dog.regNo)
    } catch (err) {
      console.error(err, 'readDogResultsFromKlapi failed')
      dog.results = []
    }

    // sire & dam

    if (json.id_Isä) {
      const sire = await klapi.lueKoiranPerustiedot({
        id: json.id_Isä,
        Kieli: KLKieli.Suomi,
      })
      if (sire.status === 200 && sire.json?.rekisterinumero) {
        dog.sire = { name: sire.json.tittelit + ' ' + sire.json.nimi }
      }
    }
    if (json.id_Emä) {
      const dam = await klapi.lueKoiranPerustiedot({
        id: json.id_Emä,
        Kieli: KLKieli.Suomi,
      })
      if (dam.status === 200 && dam.json?.rekisterinumero) {
        dog.dam = { name: dam.json.tittelit + ' ' + dam.json.nimi }
      }
    }
  } else {
    console.error('lueKoiranPerustiedot failed', { status, json, error })
  }

  return { dog, status, error }
}

const getDogLambda = lambda('getDog', async (event) => {
  const regNo = getParam(event, 'regNo').replaceAll('~', '/')

  let item = await dynamoDB.read<JsonDog>({ regNo })

  const itemAge = item?.refreshDate ? differenceInMinutes(new Date(), new Date(item.refreshDate)) : 0
  const refresh = (event.queryStringParameters && 'refresh' in event.queryStringParameters) || itemAge > 60

  console.log('cached: ' + JSON.stringify(item))
  console.log(`itemAge: ${itemAge}, refresh: ${refresh}`)

  if (!item || refresh) {
    const { dog, status, error } = await readDogFromKlapi(regNo, item)

    if (!dog) {
      throw new LambdaError(status, `Upstream error: ${error}`)
    }

    if (status === 404 && error === 'diseased') {
      await dynamoDB.delete({ regNo })

      throw new LambdaError(status, `Upstream error: ${error}`)
    }

    await dynamoDB.write(dog)

    item = dog
  }

  return response(200, item, event)
})

export default getDogLambda
