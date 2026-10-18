import type {
  DayKey,
  EventResultRequirementFn,
  ManualTestResult,
  QualifyingResult,
  QualifyingResults,
  TestResult,
} from './types'
import { addDays, addMonths, dayEnd, dayOf, dayStart, TIME_ZONE } from './lib/day'
import { NOME_B_CH_qualificationStartDate2023 } from './lib/registration'
import { manualResultDay, officialResultDay } from './lib/resultDay'

/** A ranking period as the Finnish days it is made of, both included. */
interface RankingDays {
  first: DayKey
  last: DayKey
}

type ChampionshipResult = TestResult | ManualTestResult

/** A result with the day it counts for: the day written on an official one, the Finnish day of a hand-entered one. */
interface DatedResult {
  result: ChampionshipResult
  official: boolean
  day: DayKey | undefined
}

type ScoredResult = DatedResult & { points: number }

const datedResults = (officialResults: TestResult[], manualResults: ManualTestResult[]): DatedResult[] =>
  officialResults
    .map((result): DatedResult => ({ day: officialResultDay(result.date), official: true, result }))
    .concat(manualResults.map((result) => ({ day: manualResultDay(result.date), official: false, result })))

const isWithin = (days: RankingDays, day: DayKey | undefined) =>
  day !== undefined && day >= days.first && day <= days.last

/**
 * More points first, then the later day. A tie on both keeps the input order, the official results before
 * the hand-entered ones, so the results kept are the same in every zone the decision is made in.
 */
const byPointsAndDay = (a: ScoredResult, b: ScoredResult) => {
  if (a.points !== b.points) return b.points - a.points
  return (b.day ?? '').localeCompare(a.day ?? '')
}

const toQualifyingResult = (
  result: ChampionshipResult,
  official: boolean,
  rankingPoints: number
): QualifyingResult => ({ ...result, official, qualifying: true, rankingPoints })

const getRelevantRankingResults = ({
  days,
  manualResults,
  maxResults,
  officialResults,
  resultFilter,
  resultPoints,
}: {
  days: RankingDays
  officialResults: TestResult[]
  manualResults: ManualTestResult[]
  resultFilter: (result: ChampionshipResult, inPeriod: boolean) => boolean
  resultPoints: (result: ChampionshipResult) => number
  maxResults: number
}): QualifyingResult[] =>
  datedResults(officialResults, manualResults)
    .filter(({ day, result }) => resultFilter(result, isWithin(days, day)))
    .map((dated): ScoredResult => ({ ...dated, points: resultPoints(dated.result) }))
    .sort(byPointsAndDay)
    .slice(0, maxResults)
    .map(({ official, points, result }) => toQualifyingResult(result, official, points))

/** The period's bounds as the instants the form shows: the start of its first day and the end of its last. */
const toResultDates = (days: RankingDays) => ({
  maxResultDate: dayEnd(days.last, TIME_ZONE),
  minResultDate: dayStart(days.first, TIME_ZONE),
})

/** The ranking period that closes with the entry: from the day after the same day `years` back. */
const yearsBeforeEntryEnd = (entryEndDate: Date, years: number): RankingDays => {
  const last = dayOf(entryEndDate, TIME_ZONE)

  return { first: addDays(addMonths(last, -12 * years), 1), last }
}

const getNOME_B_CH_RankingDays = (entryEndDate: Date, qualificationStartDate?: Date): RankingDays => ({
  first: dayOf(qualificationStartDate ?? NOME_B_CH_qualificationStartDate2023, TIME_ZONE),
  last: dayOf(entryEndDate, TIME_ZONE),
})

const getNOME_A_CH_RankingDays = (entryEndDate: Date) => yearsBeforeEntryEnd(entryEndDate, 2)

const getNOWT_CH_RankingDays = (entryEndDate: Date) => yearsBeforeEntryEnd(entryEndDate, 1)

export const getRankingPeriod = (
  eventType: string,
  entryEndDate: Date | undefined,
  qualificationStartDate: Date | undefined
) => {
  if (!entryEndDate) return

  switch (eventType) {
    case 'NOME-B SM':
      return toResultDates(getNOME_B_CH_RankingDays(entryEndDate, qualificationStartDate))
    case 'NOME-A SM':
      return toResultDates(getNOME_A_CH_RankingDays(entryEndDate))
    case 'NOWT SM':
      return toResultDates(getNOWT_CH_RankingDays(entryEndDate))
  }
}

export const NOME_B_CH_requirements: EventResultRequirementFn = (
  officialResults,
  manualResults,
  entryEndDate,
  qualificationStartDate
): QualifyingResults => {
  const maxResults = 5
  const days = getNOME_B_CH_RankingDays(entryEndDate ?? new Date(), qualificationStartDate)

  const resultFilter = (r: ChampionshipResult, inPeriod: boolean) =>
    r.type === 'NOME-B' &&
    r.class === 'VOI' &&
    ((inPeriod && ['VOI1', 'VOI2', 'VOI3'].includes(r.result)) || r.result.startsWith('FI KVA'))

  const POINTS: Record<string, number> = { 'FI KVA-B': 6, VOI1: 6, VOI2: 3, VOI3: 1 }

  const resultPoints = (r: ChampionshipResult) => POINTS[r.result] || 0

  // 5 best results after last NOME-B SM event's registrationEndDate are considered
  const relevant = getRelevantRankingResults({
    days,
    manualResults,
    maxResults,
    officialResults,
    resultFilter,
    resultPoints,
  })

  /**
   * SM-kokeeseen ovat oikeutettuja ilmoittautumaan Suomessa rekisteröidyt noutajat, jotka ovat saavuttaneet
   * vähintään yhden VOI1-tuloksen NOME B -kokeesta ajanjaksona, joka alkaa edellisen vuoden SM-kokeen viimeisestä
   * ilmoittautumispäivästä ja päättyy seuraavan vuoden SM-kokeen viimeiseen ilmoittautumispäivään.
   * SM-kokeeseen voidaan ottaa enintään 48 koiraa.
   *
   * Varmuudella kokeeseen pääsevät: (TODO)
   *  - Edellisen vuoden SMvoittajalla on oikeus osallistua kokeeseen ilman tulosvaatimuksia.
   *  - Koirat, jotka ovat saavuttaneet kolme VOI1-tulosta yllä mainittuna ajanjaksona, pääsevät varmasti kokeeseen.
   *    * Koirat, jotka ovat saavuttaneet KVA-arvon ennen edellisen SM-kokeen viimeistä ilmoittautumispäivää,
   *      riittää kaksi VOI1-tulosta.
   *
   * Etuoikeutetut: (TODO)
   *   - Ne kennelpiirien hallitsevat piirinmestarit, jotka ovat voittaneet piirinmestaruuden VOI1-tuloksella,
   *     ovat etuoikeutettuja osallistumaan kokeeseen.
   */
  const qualifies = relevant.some((r) => r.result === 'VOI1')

  return { ...toResultDates(days), qualifies, relevant }
}

export const NOME_A_CH_requirements: EventResultRequirementFn = (
  officialResults,
  manualResults,
  entryEndDate
): QualifyingResults => {
  /**
   * NOME A SM-kokeeseen ovat oikeutettuja ilmoittautumaan Suomessa rekisteröidyt koirat, joilla on osallistumisoikeus
   * NOME A -kokeeseen ja jotka ovat saavuttaneet korkeimman palkintosijan NOME A -kokeesta tai KV-kokeesta.
   * SM-kokeeseen voidaan ottaa enintään 24 koiraa.
   * TODO: Edellisen vuoden NOME A - mestaruuden voittajalla on oikeus osallistua kokeeseen ilman tulosvaatimuksia.
   */
  const qualifies =
    officialResults.some((r) => r.type === 'NOME-A' && r.result === 'A1') ||
    manualResults.some(
      (r) => (r.type === 'NOME-A KV' && r.result === 'EXC') || (r.type === 'NOME-A' && r.result === 'A1')
    )

  /**
   * Tuloksissa huomioidaan viiden parhaan NOME A- ja KV-kokeista saadun koetuloksen mukaiset pisteet,
   * jotka on saatu kokeen ilmoittautumisajan päättymistä edeltävän kahden vuoden aikana.
   */
  const maxResults = 5
  const days = getNOME_A_CH_RankingDays(entryEndDate ?? new Date())

  const resultFilter = (result: ChampionshipResult, inPeriod: boolean) =>
    ['NOME-A', 'NOME-A KV'].includes(result.type) &&
    ((inPeriod && ['A1', 'A2', 'A3', 'EXC', 'VG', 'G'].includes(result.result)) || result.result === 'FI KVA-FT')

  const resultPoints = (result: ChampionshipResult) => {
    if (result.result === 'FI KVA-FT') return 6
    if (result.result === 'A1' || result.result === 'EXC') {
      if (result.cert || result.cacit) return 6
      if (result.resCert || result.resCacit) return 5
      return 4
    }
    if (result.result === 'A2' || result.result === 'VG') return 2
    if (result.result === 'A3' || result.result === 'G') return 1
    return 0
  }

  const relevant = getRelevantRankingResults({
    days,
    manualResults,
    maxResults,
    officialResults,
    resultFilter,
    resultPoints,
  })

  return { ...toResultDates(days), qualifies, relevant }
}

export const NOWT_CH_requirements: EventResultRequirementFn = (
  officialResults,
  manualResults,
  entryEndDate
): QualifyingResults => {
  /**
   * Noutajien SM-kokeiden karsintaohje, 15.3 NOWT MESTARUUS:
   *
   * Kokeeseen ovat oikeutettuja ilmoittautumaan Suomessa rekisteröidyt noutajat, jotka ovat saavuttaneet KVA-WT arvon
   * tai vähintään yhden VOI1-tuloksen WT-kokeessa, joka on saatu kokeen ilmoittautumisajan päättymistä
   * edeltävän 12 kuukauden aikana.
   *
   * Mikäli kokeeseen osallistuvaa koiramäärää on tarpeen rajoittaa, tulee kokeen järjestäjän sopia asiasta
   * rotujärjestöjen kanssa. Tällöin koepaikat täytetään alla olevan taulukon mukaan laskettujen pisteiden perusteella.
   *
   * Tuloksissa huomioidaan viiden parhaan NOWT saadun koetuloksen mukaiset pisteet, jotka on saatu kokeen
   * ilmoittautumisajan päättymistä edeltävän 12 kuukauden aikana.
   *
   * TODO: KVA-WT koira pääsee kokeeseen ilman karsintaa, kun sillä on yksi pisteisiin oikeuttava tulos, joka on saatu
   * yllä mainittuna ajanjaksona.
   *
   * Tasapistetilanteissa kokeen järjestäjä suorittaa arvonnan.
   *
   * TODO: Edellisen vuoden WTW-mestarilla on oikeus osallistua kokeeseen ilman tulosvaatimuksia.
   *
   * Karsintaohjeen pisteytystaulukossa arvonimi on "KVA-WT", mutta Kennelliiton valionarvosäännöissä arvonimen
   * virallinen lyhenne on "FI KVA-WT". Sovellus tallentaa arvonimen muodossa "FI KVA-WT".
   *
   * Tämä funktio mallintaa ilmoittautumiskelpoisuuden ja karsintapisteet. Vanha FI KVA-WT oikeuttaa
   * ilmoittautumaan, mutta karsintapisteitä kertyy vain 12 kuukauden jakson tuloksista.
   *
   * TODO: Tee käyttöliittymässä selväksi, ketkä ovat oikeutettuja ohittamaan karsinnan:
   * - KVA-WT koira, jolla on yksi pisteisiin oikeuttava tulos tältä jaksolta.
   *
   * TODO: Edellisen vuoden WTW-mestarin osallistumisoikeus tarvitsee erillisen tiedon, koska mestari voi olla
   * oikeutettu ilmoittautumaan ilman KVA-WT-arvoa tai VOI1-tulosta.
   *
   * TODO: Tasapistetilanteen arvonta.
   */

  const maxResults = 5
  const days = getNOWT_CH_RankingDays(entryEndDate ?? new Date())

  const isNOWTChampionTitle = (result: ChampionshipResult) =>
    result.type === 'NOWT' && result.class === 'VOI' && result.result === 'FI KVA-WT'

  const resultFilter = (result: ChampionshipResult, inPeriod: boolean) =>
    result.type === 'NOWT' &&
    result.class === 'VOI' &&
    inPeriod &&
    (['VOI1', 'VOI2', 'VOI3'].includes(result.result) || isNOWTChampionTitle(result))

  const resultPoints = (result: ChampionshipResult) => {
    if (result.result === 'FI KVA-WT') return 6
    if (result.result === 'VOI1') {
      if (result.cert) return 6
      if (result.resCert) return 5
      return 4
    }
    if (result.result === 'VOI2') return 2
    if (result.result === 'VOI3') return 1
    return 0
  }

  const rankingResults = getRelevantRankingResults({
    days,
    manualResults,
    maxResults,
    officialResults,
    resultFilter,
    resultPoints,
  })
  const nonRankingChampionResults = datedResults(officialResults, manualResults)
    .filter(({ day, result }) => isNOWTChampionTitle(result) && !isWithin(days, day))
    .map(({ official, result }) => toQualifyingResult(result, official, 0))
  const relevant = rankingResults.concat(nonRankingChampionResults)

  const qualifies = relevant.some((r) => r.result === 'VOI1' || r.result === 'FI KVA-WT')

  return { ...toResultDates(days), qualifies, relevant }
}
