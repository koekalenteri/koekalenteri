import type { JsonTestResult } from '../types'
import { describe, expect, it } from 'vitest'
import { describeInTimeZone } from '../test-utils/timeZone'
import { filterRelevantResults, qualifyJsonRegistration } from './qualification'
import { toDog } from './wire'

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

    // A result from the trial's own year does not put the dog above its class. 23:30 Finnish time on
    // 31.12.2025 is still 2025 in UTC, so a host-zone start of the year read a 2026 result as 2025 (KOE-1545).
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
          const results = [NOU1, { ...ALO1, date }]
          const onLambda = qualifyJsonRegistration(
            { class: 'ALO', dog: { regNo: 'FI12345/22', results } },
            { eventType: 'NOME-B', startDate }
          )
          const inBrowser = filterRelevantResults(
            { eventType: 'NOME-B', startDate: new Date(startDate) },
            'ALO',
            toDog({ regNo: 'FI12345/22', results: results as JsonTestResult[] }).results
          )

          expect(onLambda.qualifies).toBe(qualifies)
          expect(inBrowser.qualifies).toBe(qualifies)
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
