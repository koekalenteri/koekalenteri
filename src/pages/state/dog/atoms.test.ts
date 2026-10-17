import { createStore } from 'jotai'
import { dogCacheAtom } from './atoms'

describe('dogCacheAtom', () => {
  afterEach(() => localStorage.clear())

  it('reads a cached dog with its birthday, its refresh and its results as Dates (KOE-1546)', () => {
    localStorage.setItem(
      'dog-cache',
      JSON.stringify({
        'FI1/20': {
          dog: {
            dob: '2020-02-02T22:00:00.000Z',
            name: '2024-05-01',
            refreshDate: '2026-05-01T08:00:00.000Z',
            regNo: 'FI1/20',
            results: [{ class: 'ALO', date: '2025-09-12T21:00:00.000Z', result: 'ALO1' }],
          },
          results: [{ class: 'AVO', date: '2025-10-12T21:00:00.000Z', id: 'm1', official: false, regNo: 'FI1/20' }],
        },
        'FI2/20': {},
      })
    )

    const cache = createStore().get(dogCacheAtom)

    expect(cache['FI1/20'].dog).toEqual({
      dob: new Date('2020-02-02T22:00:00.000Z'),
      name: '2024-05-01',
      refreshDate: new Date('2026-05-01T08:00:00.000Z'),
      regNo: 'FI1/20',
      results: [{ class: 'ALO', date: new Date('2025-09-12T21:00:00.000Z'), result: 'ALO1' }],
    })
    expect(cache['FI1/20'].results?.[0].date).toEqual(new Date('2025-10-12T21:00:00.000Z'))
    expect(cache['FI2/20']).toEqual({})
  })
})
