import type { JsonManualTestResult, JsonTestResult } from '../types'
import { describe, expect, it } from 'vitest'
import { describeInTimeZone, withTimeZone } from '../test-utils/timeZone'
import { filterRelevantResults, qualifyJsonRegistration } from './qualification'
import { toDog, toManualTestResult } from './wire'

/** Runs `run` in the host zone the lambdas have, UTC. */
const inLambdaZone = <T>(run: () => T): T => withTimeZone('UTC', run)

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
      expect(qualification.qualifyingResults).toEqual([expect.objectContaining({ official: true, result: 'NOU1' })])
    })

    // The results' days are written back as keys, whichever form they were read from (KOE-1548).
    it.each([
      ['an instant the lambda wrote', '2022-05-30T00:00:00.000Z'],
      ["Kennelliitto's stamp", '2022-05-30T00:00:00'],
      ['a key', '2022-05-30'],
    ])('writes the day of a result read from %s as a key', (_name, date) => {
      const qualification = inLambdaZone(() =>
        qualifyJsonRegistration(
          { class: 'ALO', dog: { regNo: 'FI12345/22', results: [{ ...NOU1, date }] } },
          { eventType: 'NOME-B', startDate: '2022-08-01' }
        )
      )

      expect(qualification.qualifyingResults).toEqual([expect.objectContaining({ date: '2022-05-30' })])
    })

    // Kennelliitto's empty date is no day: such a result sorts after the dated ones, and is written
    // back with an empty date rather than failing the save.
    it('sorts a result with no day after the dated ones and writes it with an empty date', () => {
      const ALO1 = { ...NOU1, class: 'ALO', result: 'ALO1', type: 'NOME-B' }
      const qualification = inLambdaZone(() =>
        qualifyJsonRegistration(
          {
            class: 'ALO',
            dog: {
              regNo: 'FI12345/22',
              results: [NOU1, { ...ALO1, date: '0001-01-01T00:00:00' }, { ...ALO1, date: '2022-06-01T00:00:00' }],
            },
          },
          { eventType: 'NOME-B', startDate: '2022-08-01' }
        )
      )

      expect(qualification.qualifyingResults?.map((r) => [r.result, r.date])).toEqual([
        ['NOU1', '2022-05-30'],
        ['ALO1', '2022-06-01'],
        ['ALO1', ''],
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

        // A hand-entered ALO1 stored before the results were day keys: the picked moment as an instant.
        // It counts for its Finnish year in the browser and on the lambda alike; picked on 1 January in
        // Tokyo, that is still 31 December in Finland. Such rows are read so until KOE-1547 migrates them.
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

        it('reads a hand-entered result of 1.1. sent as a key in the year it names', () => {
          const manual: JsonManualTestResult = { ...ALO1, date: '2026-01-01', id: 'manual-1' }
          const onLambda = inLambdaZone(() =>
            qualifyJsonRegistration(
              { class: 'ALO', dog: { regNo: 'FI12345/22', results: [NOU1] }, results: [manual] },
              { eventType: 'NOME-B', startDate }
            )
          )
          const inBrowser = filterRelevantResults(
            { eventType: 'NOME-B', startDate: new Date(startDate) },
            'ALO',
            toDog({ regNo: 'FI12345/22', results: [NOU1] }).results,
            [toManualTestResult(manual)]
          )

          expect(inBrowser.qualifies).toBe(true)
          expect(onLambda.qualifies).toBe(true)
        })
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
