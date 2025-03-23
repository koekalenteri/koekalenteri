import type { ManualTestResult, QualifyingResult, QualifyingResults, TestResult } from './types'

import { subYears } from 'date-fns'

import { zonedEndOfDay } from './i18n/dates'
import { NOME_B_CH_qualificationStartDate2023 } from './lib/registration'

export type EventResultRequirementFn = (
  officialResults: TestResult[],
  manualResults: ManualTestResult[],
  entryEndDate: Date | undefined,
  qualificationStartDate: Date | undefined
) => QualifyingResults

const byPointsAndDate = (a: QualifyingResult, b: QualifyingResult) => {
  const aPoints = a.rankingPoints ?? 0
  const bPoints = b.rankingPoints ?? 0

  if (aPoints === bPoints) {
    return b.date.valueOf() - a.date.valueOf()
  }
  return bPoints - aPoints
}

const getNOME_B_CH_RankingPeriod = (entryEndDate?: Date, qualificationStartDate?: Date) => ({
  maxResultDate: zonedEndOfDay(entryEndDate ?? new Date()),
  minResultDate: qualificationStartDate ?? NOME_B_CH_qualificationStartDate2023,
})

const getNOME_A_CH_RankingPeriod = (entryEndDate: Date) => {
  const endDate = zonedEndOfDay(entryEndDate)

  return {
    maxResultDate: endDate,
    minResultDate: subYears(endDate, 2),
  }
}

const getNOWT_CH_RankingPeriod = (entryEndDate: Date) => {
  const endDate = zonedEndOfDay(entryEndDate)

  return {
    maxResultDate: endDate,
    minResultDate: subYears(endDate, 1),
  }
}

export const getRankingPeriod = (
  eventType: string,
  entryEndDate: Date | undefined,
  qualificationStartDate: Date | undefined
) => {
  if (!entryEndDate) return

  switch (eventType) {
    case 'NOME-B SM':
      return getNOME_B_CH_RankingPeriod(entryEndDate, qualificationStartDate)
    case 'NOME-A SM':
      return getNOME_A_CH_RankingPeriod(entryEndDate)
    case 'NOWT SM':
      return getNOWT_CH_RankingPeriod(entryEndDate)
  }
}

export const NOME_B_CH_requirements: EventResultRequirementFn = (
  officialResults,
  manualResults,
  entryEndDate,
  qualificationStartDate
): QualifyingResults => {
  const maxResults = 5
  const { maxResultDate, minResultDate } = getNOME_B_CH_RankingPeriod(
    entryEndDate ?? new Date(),
    qualificationStartDate
  )

  const resultFilter = (r: TestResult | ManualTestResult) =>
    r.type === 'NOME-B' &&
    r.class === 'VOI' &&
    ((r.date >= minResultDate && r.date <= maxResultDate && ['VOI1', 'VOI2', 'VOI3'].includes(r.result)) ||
      r.result.startsWith('FI KVA'))

  const POINTS: Record<string, number> = { 'FI KVA-B': 6, VOI1: 6, VOI2: 3, VOI3: 1 }

  const resultPoints = (r: TestResult | ManualTestResult) => POINTS[r.result] || 0

  // 5 best results after last NOME-B SM event's registrationEndDate are considered
  const relevant: QualifyingResult[] = officialResults
    .filter(resultFilter)
    .map((r) => ({ ...r, qualifying: true, official: true, rankingPoints: resultPoints(r) }))
    .concat(
      manualResults
        .filter(resultFilter)
        .map((r) => ({ ...r, qualifying: true, official: false, rankingPoints: resultPoints(r) }))
    )
    .sort(byPointsAndDate)

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
  const qualifies = Boolean(relevant.find((r) => r.result === 'VOI1'))

  return { relevant: relevant.slice(0, maxResults), qualifies, minResultDate, maxResultDate }
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
  const { minResultDate, maxResultDate } = getNOME_A_CH_RankingPeriod(entryEndDate ?? new Date())

  const resultFilter = (result: TestResult | ManualTestResult) =>
    ['NOME-A', 'NOME-A KV'].includes(result.type) &&
    ((result.date >= minResultDate &&
      result.date <= maxResultDate &&
      ['A1', 'A2', 'A3', 'EXC', 'VG', 'G'].includes(result.result)) ||
      result.result === 'FI KVA-FT')

  const resultPoints = (result: TestResult | ManualTestResult) => {
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

  const relevant: QualifyingResult[] = officialResults
    .filter(resultFilter)
    .map((r) => ({ ...r, qualifying: true, official: true, rankingPoints: resultPoints(r) }))
    .concat(
      manualResults
        .filter(resultFilter)
        .map((r) => ({ ...r, qualifying: true, official: false, rankingPoints: resultPoints(r) }))
    )
    .sort(byPointsAndDate)

  return { relevant: relevant.slice(0, maxResults), qualifies, minResultDate, maxResultDate }
}

export const NOWT_CH_requirements: EventResultRequirementFn = (
  officialResults,
  manualResults,
  entryEndDate
): QualifyingResults => {
  /**
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
   * TODO: Edellisen vuoden WTWmestarilla on oikeus osallistua kokeeseen ilman tulosvaatimuksia.
   */

  const maxResults = 5
  const { minResultDate, maxResultDate } = getNOWT_CH_RankingPeriod(entryEndDate ?? new Date())

  const resultFilter = (result: TestResult | ManualTestResult) =>
    result.type === 'NOWT' &&
    result.class === 'VOI' &&
    ((result.date >= minResultDate &&
      result.date <= maxResultDate &&
      ['VOI1', 'VOI2', 'VOI3'].includes(result.result)) ||
      result.result === 'FI KVA-WT')

  const resultPoints = (result: TestResult | ManualTestResult) => {
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

  const relevant: QualifyingResult[] = officialResults
    .filter(resultFilter)
    .map((r) => ({ ...r, qualifying: true, official: true, rankingPoints: resultPoints(r) }))
    .concat(
      manualResults
        .filter(resultFilter)
        .map((r) => ({ ...r, qualifying: true, official: false, rankingPoints: resultPoints(r) }))
    )
    .sort(byPointsAndDate)

  const qualifies = relevant.some((r) => r.result === 'VOI1')

  return { relevant: relevant.slice(0, maxResults), qualifies, minResultDate, maxResultDate }
}
