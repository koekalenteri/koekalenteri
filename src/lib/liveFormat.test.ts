import {
  IMPLICIT_STATION_ID,
  liveFormat,
  MAX_DOGS_AT_ONCE,
  resolveStation,
  stationDogsAtOnce,
  stationPhases,
} from './liveFormat'

describe('liveFormat', () => {
  it('gives an unlisted event type the default: one post, a queue, nothing but the result', () => {
    const format = liveFormat('NKM')

    expect(format).toEqual({ flow: 'queue', marks: [], posts: 'one', tasks: 'none' })
    expect(liveFormat(undefined)).toEqual(format)
  })

  it('leaves the dog count to the post by default, rather than forcing it back to one', () => {
    expect(stationDogsAtOnce('NKM', { dogsAtOnce: 4 })).toBe(4)
    expect(stationDogsAtOnce('NKM')).toBe(1)
  })

  it('describes the formats the plan tabulates', () => {
    expect(liveFormat('NOWT')).toEqual({ flow: 'queue', marks: [], posts: 'many', tasks: 'post' })
    expect(liveFormat('NOME-B')).toMatchObject({ flow: 'queue', posts: 'one', tasks: 'phases' })
    expect(liveFormat('NOME-B').phases).toBeUndefined()
    expect(liveFormat('NOU')).toMatchObject({ dogsAtOnce: 1, flow: 'queue', posts: 'one', tasks: 'phases' })
    expect(liveFormat('NOME-A')).toMatchObject({ dogsAtOnce: 4, flow: 'field', posts: 'one', tasks: 'retrieve' })
  })

  it('gives the championship variants the same shape as their own type', () => {
    expect(liveFormat('NOWT SM')).toEqual(liveFormat('NOWT'))
    expect(liveFormat('NOME-B SM')).toEqual(liveFormat('NOME-B'))
    expect(liveFormat('NOME-A SM')).toEqual(liveFormat('NOME-A'))
  })

  it('marks are the live vocabulary of NOME-A alone', () => {
    expect(liveFormat('NOME-A').marks).toEqual(['onRetrieve', 'gotRetrieve', 'noRetrieve', 'eyeWipe', 'firstDogDown'])
    expect(liveFormat('NOWT').marks).toEqual([])
    expect(liveFormat('NOU').marks).toEqual([])
  })

  it('offers the interruption only where a judge may stop a dog short of an eliminating fault', () => {
    expect(liveFormat('NOME-A').interruption).toBe(true)
    expect(liveFormat('NOWT').interruption).toBeUndefined()
  })

  describe('stationDogsAtOnce', () => {
    it("takes the post's own form where the format leaves it open", () => {
      expect(stationDogsAtOnce('NOWT', { dogsAtOnce: 4 })).toBe(4)
      expect(stationDogsAtOnce('NOWT', { dogsAtOnce: 2 })).toBe(2)
    })

    it('is one when neither the format nor the post says', () => {
      expect(stationDogsAtOnce('NOWT')).toBe(1)
      expect(stationDogsAtOnce('NOWT', {})).toBe(1)
      expect(stationDogsAtOnce('NOWT', { dogsAtOnce: 0 })).toBe(1)
    })

    it('lets the format overrule the post: NOME-A runs four whatever the post says', () => {
      expect(stationDogsAtOnce('NOME-A', { dogsAtOnce: 1 })).toBe(4)
      expect(stationDogsAtOnce('NOU', { dogsAtOnce: 6 })).toBe(1)
    })

    it('caps a stored count at the widest walk-up a turn may hold', () => {
      expect(stationDogsAtOnce('NOWT', { dogsAtOnce: 99 })).toBe(MAX_DOGS_AT_ONCE)
    })
  })

  describe('stationPhases', () => {
    it('gives a taipumuskoe its fixed day: the briefing for everyone, then the water mark and the search', () => {
      expect(stationPhases('NOU')).toEqual([{ key: 'briefing', whole: true }, { key: 'waterMark' }, { key: 'search' }])
      // The format's list is the format's: a post cannot write over it.
      expect(stationPhases('NOU', { phases: ['Oma'] })).toEqual(stationPhases('NOU'))
    })

    it("takes a B trial's phases from the post, as its secretary wrote them", () => {
      expect(stationPhases('NOME-B', { phases: ['Markkeeraus', 'Haku'] })).toEqual([
        { key: 'Markkeeraus', label: 'Markkeeraus' },
        { key: 'Haku', label: 'Haku' },
      ])
      expect(stationPhases('NOME-B')).toEqual([])
    })

    it('has no phases where the post or the retrieve is the unit', () => {
      expect(stationPhases('NOWT', { phases: ['Ei'] })).toEqual([])
      expect(stationPhases('NOME-A')).toEqual([])
    })
  })

  describe('resolveStation', () => {
    const stored = { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 as const }

    it('answers for the implicit post of a single-post format that has none stored', () => {
      const event = { eventType: 'NOME-B', startDate: '2026-09-12' }

      expect(resolveStation(event, IMPLICIT_STATION_ID)).toEqual({
        date: '2026-09-12',
        id: IMPLICIT_STATION_ID,
        number: 1,
        tasks: 1,
      })
      expect(resolveStation({ ...event, stations: [] }, IMPLICIT_STATION_ID)).toEqual(
        resolveStation(event, IMPLICIT_STATION_ID)
      )
      // The default format is a single post too, so a type the app has no notion of gets one.
      expect(resolveStation({ ...event, eventType: 'NKM' }, IMPLICIT_STATION_ID)).toMatchObject({ id: '1' })
      // But only the one post: any other id is a post the event does not have.
      expect(resolveStation(event, 'post-1')).toBeUndefined()
    })

    it('keeps the date type of whichever side asks', () => {
      const startDate = new Date('2026-09-12T09:00:00Z')

      expect(resolveStation({ eventType: 'NOU', startDate }, IMPLICIT_STATION_ID)?.date).toBe(startDate)
    })

    it('lets the stored post win once something has written it down', () => {
      const revoked = { ...stored, id: IMPLICIT_STATION_ID, tokenVersion: 2 }

      expect(resolveStation({ eventType: 'NOME-B', startDate: '2026-09-12', stations: [revoked] }, '1')).toBe(revoked)
    })

    it('gives a many-post format only the posts it laid out', () => {
      const event = { eventType: 'NOWT', startDate: '2026-09-12', stations: [stored] }

      expect(resolveStation(event, 'post-1')).toBe(stored)
      expect(resolveStation(event, IMPLICIT_STATION_ID)).toBeUndefined()
      expect(resolveStation({ ...event, stations: undefined }, IMPLICIT_STATION_ID)).toBeUndefined()
    })

    it('never invents a post beside the ones an event has', () => {
      const event = { eventType: 'NOME-B', startDate: '2026-09-12', stations: [stored] }

      expect(resolveStation(event, IMPLICIT_STATION_ID)).toBeUndefined()
    })
  })
})
