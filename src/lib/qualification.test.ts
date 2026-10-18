import type { JsonManualTestResult, JsonTestResult } from '../types'
import { describe, expect, it } from 'vitest'
import { describeInTimeZone } from '../test-utils/timeZone'
import { filterRelevantResults, qualifyJsonRegistration } from './qualification'
import { toDog, toManualTestResult } from './wire'

/** Runs `run` with the host zone the lambdas have, UTC, and gives the test's own zone back after. */
const inLambdaZone = <T>(run: () => T): T => {
  const zone = process.env.TZ
  process.env.TZ = 'UTC'
  try {
    return run()
  } finally {
    process.env.TZ = zone
  }
}

describe('lib/qualification', () => {
  describe('qualifyJsonRegistration', () => {
    const NOU1 = {
      class: '',
      date: '2022-05-30T00:00:00.000Z',
      judge: 'Test Judge',
      location: 'Test',
      result: 'NOU1',
      type: 'NOU',
    }

    it('decides the same way as the form and hands the relevant results back as JSON', () => {
      const qualification = qualifyJsonRegistration(
        { class: 'ALO', dog: { regNo: 'FI12345/22', results: [NOU1] } },
        { eventType: 'NOME-B', startDate: '2022-08-01' }
      )

      expect(qualification.qualifies).toBe(true)
      expect(qualification.qualifyingResults).toEqual([
        expect.objectContaining({ date: NOU1.date, official: true, result: 'NOU1' }),
      ])
    })

    it('counts the owner’s own claims as unofficial results', () => {
      const qualification = qualifyJsonRegistration(
        { class: 'ALO', dog: { regNo: 'FI12345/22', results: [] }, results: [{ ...NOU1, id: 'manual-1' }] },
        { eventType: 'NOME-B', startDate: '2022-08-01' }
      )

      expect(qualification.qualifies).toBe(true)
      expect(qualification.qualifyingResults).toEqual([
        expect.objectContaining({ id: 'manual-1', official: false, regNo: 'FI12345/22' }),
      ])
    })

    // Kennelliitto's result stamps have no zone. A result from the trial's own year does not put the dog
    // above its class, and the browser (through the typed boundary) and the lambda answer alike in any
    // zone: 1 January is the trial's year, 31 December the year before (KOE-1545).
    for (const zone of ['UTC', 'Europe/Helsinki', 'America/New_York', 'Asia/Tokyo']) {
      describeInTimeZone(zone, () => {
        const ALO1 = { ...NOU1, class: 'ALO', result: 'ALO1', type: 'NOME-B' }
        const startDate = '2026-03-15T22:00:00.000Z'

        it.each([
          // 1 January is the trial's year: the result is compared by its year, not against a midnight.
          { date: '2026-01-01T00:00:00', qualifies: true },
          { date: '2026-01-02T00:00:00', qualifies: true },
          { date: '2025-12-31T00:00:00', qualifies: false },
        ])('reads a result of $date in the year it was written: qualifies $qualifies', ({ date, qualifies }) => {
          const results: JsonTestResult[] = [NOU1, { ...ALO1, date }]
          const onLambda = inLambdaZone(() =>
            qualifyJsonRegistration(
              { class: 'ALO', dog: { regNo: 'FI12345/22', results } },
              { eventType: 'NOME-B', startDate }
            )
          )
          const inBrowser = filterRelevantResults(
            { eventType: 'NOME-B', startDate: new Date(startDate) },
            'ALO',
            toDog({ regNo: 'FI12345/22', results }).results
          )

          expect(onLambda.qualifies).toBe(qualifies)
          expect(inBrowser.qualifies).toBe(qualifies)
        })

        // A hand-entered ALO1 picked in this browser, as the form sends it: the picked moment as an
        // instant. It counts for its Finnish year in the browser and on the lambda alike; picked on
        // 1 January in Tokyo, that is still 31 December in Finland.
        const pickedOnNewYear = zone !== 'Asia/Tokyo'
        it.each([
          { name: '1.1. at midnight', picked: () => new Date(2026, 0, 1), qualifies: pickedOnNewYear },
          { name: '1.1. at 00:30', picked: () => new Date(2026, 0, 1, 0, 30), qualifies: pickedOnNewYear },
          { name: '31.12. at midnight', picked: () => new Date(2025, 11, 31), qualifies: false },
        ])(
          'reads a hand-entered result picked on $name alike in the browser and on the lambda',
          ({ picked, qualifies }) => {
            const manual: JsonManualTestResult = JSON.parse(
              JSON.stringify({ ...ALO1, date: picked(), id: 'manual-1', official: false, regNo: 'FI12345/22' })
            )
            const official: JsonTestResult[] = [NOU1]
            const onLambda = inLambdaZone(() =>
              qualifyJsonRegistration(
                { class: 'ALO', dog: { regNo: 'FI12345/22', results: official }, results: [manual] },
                { eventType: 'NOME-B', startDate }
              )
            )
            const inBrowser = filterRelevantResults(
              { eventType: 'NOME-B', startDate: new Date(startDate) },
              'ALO',
              toDog({ regNo: 'FI12345/22', results: official }).results,
              [toManualTestResult(manual)]
            )

            expect(inBrowser.qualifies).toBe(qualifies)
            expect(onLambda.qualifies).toBe(qualifies)
          }
        )
      })
    }

    it('rejects a dog whose official results already put it above the class', () => {
      const ALO1 = { ...NOU1, class: 'ALO', result: 'ALO1', type: 'NOME-B' }
      const qualification = qualifyJsonRegistration(
        { class: undefined, dog: { regNo: 'FI12345/22', results: [ALO1] } },
        { eventType: 'NOU', startDate: '2022-08-01' }
      )

      expect(qualification.qualifies).toBe(false)
      expect(qualification.qualifyingResults).toEqual([expect.objectContaining({ qualifying: false, result: 'ALO1' })])
    })
  })
})
