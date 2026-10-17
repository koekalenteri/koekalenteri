import { describe, expect, it } from 'vitest'
import { qualifyJsonRegistration } from './qualification'

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
    it("tells the trial year's results apart by the Finnish year", () => {
      const trial = { eventType: 'NOME-B', startDate: '2026-08-01T00:00:00.000Z' }
      const ALO1 = { ...NOU1, class: 'ALO', result: 'ALO1', type: 'NOME-B' }
      const qualify = (date: string) =>
        qualifyJsonRegistration(
          { class: 'ALO', dog: { regNo: 'FI12345/22', results: [NOU1, { ...ALO1, date }] } },
          trial
        )

      expect(qualify('2025-12-31T21:30:00.000Z').qualifies).toBe(false)
      expect(qualify('2025-12-31T22:30:00.000Z').qualifies).toBe(true)
    })

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
