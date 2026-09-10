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
