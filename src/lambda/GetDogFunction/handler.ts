import type { BreedCode, JsonDog, JsonEventType, JsonTestResult } from '../../types'
import type { KLKoira } from '../types/KLAPI'
import { differenceInMinutes } from 'date-fns/differenceInMinutes'
import { calendarDayOf, TIME_ZONE } from '../../lib/day'
import KLAPI from '../lib/KLAPI'
import { getParam, LambdaError, lambda, response } from '../lib/lambda'
import { logger } from '../lib/log'
import { deleteDog, readDog, writeDog } from '../lib/repositories/dogRepository'
import { readEventTypes } from '../lib/repositories/eventTypeRepository'
import { getKLAPIConfig } from '../lib/secrets'
import { KLKieli } from '../types/KLAPI'

export const filterDogResults = (
  dog: JsonDog,
  eventTypes: ReadonlyArray<Pick<JsonEventType, 'active' | 'eventType'>>
): JsonDog => {
  if (!dog.results) return dog

  const activeEventTypes = new Set(eventTypes.filter(({ active }) => active).map(({ eventType }) => eventType))
  return { ...dog, results: dog.results.filter(({ type }) => activeEventTypes.has(type)) }
}

const GENDER: Record<KLKoira['sukupuoli'], 'F' | 'M'> = {
  female: 'F',
  hane: 'M',
  male: 'M',
  narttu: 'F',
  tik: 'F',
  uros: 'M',
}

/**
 * Kennelliitto's day as a key (KOE-1548): it writes days as midnights without a zone
 * (`2021-01-01T00:00:00`) or bare days. Undefined for none: a null, or its empty date 0001-01-01.
 */
const kcDay = (stamp: string | null | undefined) => (stamp ? calendarDayOf(stamp, TIME_ZONE) : undefined)

const readDogResultsFromKlapi = async (klapi: KLAPI, regNo: string): Promise<JsonTestResult[]> => {
  // Luetaan koetulokset käyttäen palautettua rekisterinumeroa.
  // Jos koiralla on useampi rekkari, niin palautettu on se mille tulokset on kirjattu.
  const apiResult = await klapi.lueKoiranKoetulokset({ Kieli: KLKieli.Suomi, Rekisterinumero: regNo })

  if (apiResult.status !== 200) {
    logger.error('lueKoiranKoetulokset failed', { error: apiResult.error, regNo, status: apiResult.status })

    return []
  }

  const results: JsonTestResult[] = []

  for (const result of apiResult.json || []) {
    const notes = (result.lisämerkinnät || '').toLocaleLowerCase().trim()
    const resCert = /vara[ -]sert/.test(notes)
    const cert = !resCert && /sert/.test(notes)
    const resCacit = /vara[ -]cacit/.test(notes)
    const cacit = !resCacit && /cacit/.test(notes)

    results.push({
      cacit,

      cert,
      class: result.luokka,
      // A result with no day is stored with an empty date, which every reader takes as none.
      date: kcDay(result.aika) ?? '',

      ext: result.tarkenne,
      judge: result.tuomari,
      location: result.paikkakunta,
      notes: result.lisämerkinnät,
      points: result.pisteet,
      rank: result.sijoitus,
      resCacit,
      resCert,
      result: result.tulos,
      subType: result.tapahtumanTyyppi,
      type: result.koemuoto,
    })
  }

  return results
}

const createDogFromJson = (json: KLKoira, existing?: JsonDog): JsonDog => ({
  ...existing, // keep refined info on refresh
  breedCode: json.rotukoodi as BreedCode,
  // No day leaves no birth date: the put replaces the row, so an earlier one does not linger.
  dob: kcDay(json.syntymäaika),
  gender: GENDER[json.sukupuoli],
  kcId: json.id,
  name: json.nimi,
  refreshDate: new Date().toISOString(),
  regNo: json.rekisterinumero,
  rfid: json.tunnistusmerkintä,
  titles: json.tittelit,
})

const readParentFromKlapi = async (klapi: KLAPI, id: number): Promise<{ name: string } | undefined> => {
  const parent = await klapi.lueKoiranPerustiedot(
    {
      id,
      Kieli: KLKieli.Suomi,
    },
    true
  )
  if (parent.status === 200 && parent.json?.rekisterinumero) {
    return {
      name: [parent.json.tittelit, parent.json.nimi]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' '),
    }
  }
  return undefined
}

const readDogFromKlapi = async (regNo: string, existing?: JsonDog) => {
  const klapi = new KLAPI(getKLAPIConfig)
  const { status, json, error } = await klapi.lueKoiranPerustiedot({
    Kieli: KLKieli.Suomi,
    Rekisterinumero: regNo,
  })

  let dog = existing

  if (status === 200 && json?.rekisterinumero) {
    dog = createDogFromJson(json, existing)

    try {
      dog.results = await readDogResultsFromKlapi(klapi, dog.regNo)
    } catch (err) {
      logger.error('readDogResultsFromKlapi failed', { error: err, regNo: dog.regNo })
      dog.results = []
    }

    // sire & dam
    if (json.id_Isä) {
      dog.sire = await readParentFromKlapi(klapi, json.id_Isä)
    }
    if (json.id_Emä) {
      dog.dam = await readParentFromKlapi(klapi, json.id_Emä)
    }
  } else {
    logger.error('lueKoiranPerustiedot failed', { error, regNo, status })
  }

  return { dog, error, status }
}

const getDogLambda = lambda('getDog', async (event) => {
  const regNo = getParam(event, 'regNo').replaceAll('~', '/')

  let item = await readDog(regNo)

  const itemAge = item?.refreshDate ? differenceInMinutes(new Date(), new Date(item.refreshDate)) : 0
  // A row stored before the lookup stamped its time (43c705280, 2022) is as stale as can be: the form
  // reads a dog without one as entered by hand (`typedDogFields`, KOE-1650).
  const unstamped = Boolean(item) && !item?.refreshDate
  const refresh = (event.queryStringParameters && 'refresh' in event.queryStringParameters) || itemAge > 60 || unstamped

  logger.debug('cached dog', { cached: Boolean(item), itemAge, refresh, regNo })

  if (!item || refresh) {
    const { dog, status, error } = await readDogFromKlapi(regNo, item)

    if (!dog) {
      throw new LambdaError(status, `Upstream error: ${error}`)
    }

    if (status === 404 && error === 'diseased') {
      await deleteDog(regNo)

      throw new LambdaError(status, `Upstream error: ${error}`)
    }

    await writeDog(dog)

    item = dog
  }

  return response(200, filterDogResults(item, await readEventTypes()), event)
})

export default getDogLambda
