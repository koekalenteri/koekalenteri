import type { EventStation, ExerciseEventResult, JsonRegistration } from '../../types'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import { linkedEventProjection } from './event'
import {
  authorizeStationEntry,
  deriveStationEntryToken,
  getStationEntryToken,
  scopeResultToStation,
  stationEntryResponse,
} from './stationEntry'

const station: EventStation = { date: '2026-09-12', id: 'post-1', number: 1 }

const confirmedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO' }],
  endDate: '2026-09-12',
  eventType: 'NOWT',
  id: 'event-1',
  location: 'Ranua',
  name: 'Syyskoe',
  startDate: '2026-09-12',
  stations: [station],
})

const headers = (token?: string) => ({ headers: token ? { authorization: `Bearer ${token}` } : {} })

describe('stationEntry', () => {
  describe('tokens', () => {
    it('changes with the version, which is what revocation is', () => {
      const before = deriveStationEntryToken('event-1', { id: 'post-1' }, 'secret')
      const after = deriveStationEntryToken('event-1', { id: 'post-1', tokenVersion: 2 }, 'secret')

      expect(before).not.toEqual(after)
      // An absent version is version 1, so links minted before the field existed keep working.
      expect(before).toEqual(deriveStationEntryToken('event-1', { id: 'post-1', tokenVersion: 1 }, 'secret'))
    })

    it('opens the station for the right token only', () => {
      const token = getStationEntryToken('event-1', station)

      expect(authorizeStationEntry(headers(token), 'event-1', confirmedEvent, 'post-1')).toMatchObject({
        id: 'post-1',
      })

      // A wrong token, a missing one and an unknown station all read the same from outside.
      expect(() => authorizeStationEntry(headers('wrong'), 'event-1', confirmedEvent, 'post-1')).toThrow('not found')
      expect(() => authorizeStationEntry(headers(), 'event-1', confirmedEvent, 'post-1')).toThrow('not found')
      expect(() => authorizeStationEntry(headers(token), 'event-1', confirmedEvent, 'post-9')).toThrow('not found')
    })

    it('opens the implicit post of a single-post format, which has nothing stored to find', () => {
      const singlePost = asJsonConfirmedEvent({ ...confirmedEvent, eventType: 'NOME-B', stations: undefined })
      const token = getStationEntryToken('event-1', { id: '1' })

      expect(authorizeStationEntry(headers(token), 'event-1', singlePost, '1')).toMatchObject({
        date: '2026-09-12',
        id: '1',
        number: 1,
      })
      // A NOWT with no course laid out has no post at all, implicit or otherwise.
      expect(() =>
        authorizeStationEntry(headers(token), 'event-1', { ...confirmedEvent, stations: undefined }, '1')
      ).toThrow('not found')
    })

    it('closes the implicit post to the old link once its version has been written down', () => {
      const revoked: EventStation = { date: '2026-09-12', id: '1', number: 1, tokenVersion: 2 }
      const singlePost = asJsonConfirmedEvent({ ...confirmedEvent, eventType: 'NOME-B', stations: [revoked] })
      const before = getStationEntryToken('event-1', { id: '1' })
      const after = getStationEntryToken('event-1', revoked)

      expect(() => authorizeStationEntry(headers(before), 'event-1', singlePost, '1')).toThrow('not found')
      expect(authorizeStationEntry(headers(after), 'event-1', singlePost, '1')).toMatchObject({
        tokenVersion: 2,
      })
    })

    it('rejects a token minted for another station or event', () => {
      const other = getStationEntryToken('event-2', station)

      expect(() => authorizeStationEntry(headers(other), 'event-1', confirmedEvent, 'post-1')).toThrow('not found')
    })
  })

  describe('stationEntryResponse', () => {
    const registration = (id: string, overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
      asJsonRegistration({
        class: 'ALO',
        dog: { name: `Dog ${id}`, regNo: `REG-${id}` },
        eventId: 'event-1',
        eventType: 'NOWT',
        group: { date: '2026-09-12', key: 'ALO-AP', number: Number(id.slice(-1)), time: 'ap' },
        handler: { email: 'x@example.com', name: 'Handler', phone: '123' },
        id,
        owner: { email: 'x@example.com', name: 'Owner' },
        ...overrides,
      })

    it('tells the post when the trial is out of its hands, and says nothing of the state itself', () => {
      const locked = { ...confirmedEvent, kcState: { code: 1253, name: 'Ylituomarin hyväksyttäväksi', readAt: 'x' } }

      const result = stationEntryResponse(locked, station, [registration('run-1')])

      expect(result.event.locked).toEqual(true)
      expect(result.event).not.toHaveProperty('kcState')
      // The lock is the post's to know; the other links built on the same projection are told nothing of it.
      expect(linkedEventProjection(locked)).not.toHaveProperty('locked')
      expect(stationEntryResponse(confirmedEvent, station, [registration('run-1')]).event).not.toHaveProperty('locked')
    })

    it('serves the minimum a post needs to call dogs up, and nothing personal', () => {
      const result = stationEntryResponse(confirmedEvent, station, [registration('run-1')])
      const dog = result.registrations[0]

      expect(dog).toEqual({
        class: 'ALO',
        dog: { name: 'Dog run-1' },
        eventType: 'NOWT',
        group: { date: '2026-09-12', key: 'ALO-AP', number: 1, time: 'ap' },
        id: 'run-1',
        visit: { exercise: 1, exercisePosts: ['post-1'], parts: 1, slotsBefore: 0 },
      })
      // The link is shared on paper at a venue; contact details must not ride on it.
      expect(JSON.stringify(result)).not.toContain('example.com')
      expect(JSON.stringify(result)).not.toContain('regNo')
    })

    it('lists the dogs exercise by exercise as their groups come to the post, each with its exercise there (KOE-1665)', () => {
      const posts = [station, { date: '2026-09-12' as const, id: 'post-2', number: 2 }]
      const rotated = {
        ...confirmedEvent,
        rotations: [
          {
            class: 'ALO' as const,
            exercises: [{ stationId: 'post-1' }, { stationId: 'post-2' }, { stationId: 'post-2' }],
          },
          {
            class: 'AVO' as const,
            exercises: [{ stationId: 'post-2' }, { stationId: 'post-1' }, { stationId: 'post-1' }],
          },
          { class: 'VOI' as const, exercises: [{ stationId: 'post-2' }] },
        ],
        stations: posts,
      }
      const dogs = [
        registration('run-3', { class: 'AVO' }),
        registration('run-2'),
        registration('run-1'),
        registration('run-4', { class: 'VOI' }),
      ]

      expect(
        stationEntryResponse(rotated, station, dogs).registrations.map((dog) => [dog.id, dog.visit?.exercise])
      ).toEqual([
        ['run-1', 1],
        ['run-2', 1],
        ['run-3', 2],
        ['run-3', 3],
      ])
    })

    it("serves a qualitative type's verdict, so the link can show who is done", () => {
      const judge = { id: 123, name: 'Tuomari' }
      const singlePost = asJsonConfirmedEvent({ ...confirmedEvent, eventType: 'NOME-B', stations: undefined })
      const scored = registration('run-1', {
        eventResult: { judge, result: 'ALO1', updatedAt: 't1', updatedBy: 'u' },
        eventType: 'NOME-B',
      })
      const implicit: EventStation = { date: '2026-09-12', id: '1', number: 1 }

      // The version rides along, since the post's next save of this dog is based on it.
      expect(stationEntryResponse(singlePost, implicit, [scored]).registrations[0].eventResult).toEqual({
        judge,
        result: 'ALO1',
        updatedAt: 't1',
      })
    })

    it('leaves out reserves and hides the revocation counter', () => {
      const reserve = registration('res-1', { group: { key: 'reserve', number: 1 } } as Partial<JsonRegistration>)
      const result = stationEntryResponse(confirmedEvent, { ...station, tokenVersion: 3 }, [reserve])

      expect(result.registrations).toHaveLength(0)
      expect(result.station).not.toHaveProperty('tokenVersion')
    })

    it("shows this post's recordings and no other post's", () => {
      const scored = registration('run-1', {
        eventResult: {
          tasks: [
            { index: 0, points: 17, stationId: 'post-1', updatedAt: 't1', updatedBy: 'u' },
            { index: 0, points: 12, stationId: 'post-2', updatedAt: 't2', updatedBy: 'u' },
          ],
          updatedAt: 't2',
          updatedBy: 'u',
        },
      })

      const [dog] = stationEntryResponse(confirmedEvent, station, [scored]).registrations

      expect(dog.eventResult?.tasks).toHaveLength(1)
      expect(dog.eventResult?.tasks?.[0]).toMatchObject({ exercise: 1, part: 0, points: 17 })
    })
    describe('a post doing two exercises of the running order (KOE-1665, Jukka 2.11.2026)', () => {
      const posts = [1, 2, 3].map((number) => ({ date: '2026-09-12' as const, id: `post-${number}`, number }))
      const third = posts[2]
      const corrected = {
        ...confirmedEvent,
        rotations: [
          {
            class: 'ALO' as const,
            exercises: [
              { stationId: 'post-1' },
              { stationId: 'post-2' },
              { stationId: 'post-3' },
              { stationId: 'post-3' },
            ],
          },
        ],
        stations: posts,
      }
      const byExercise = (exercise: number, points: number) => ({
        exercise,
        part: 0,
        points,
        updatedAt: 't1',
        updatedBy: 'u',
      })

      it('serves both exercises of the post, the scores of both, and no other', () => {
        const scored = registration('run-1', {
          eventResult: {
            tasks: [byExercise(1, 11), byExercise(3, 13), byExercise(4, 14)],
            updatedAt: 't1',
            updatedBy: 'u',
          },
        })

        const entries = stationEntryResponse(corrected, third, [scored]).registrations

        expect(entries.map((dog) => dog.visit?.exercise)).toEqual([3, 4])
        expect(entries[0].eventResult?.tasks).toEqual([byExercise(3, 13), byExercise(4, 14)])
      })

      it('serves a score stored at its post and slot there by its exercise', () => {
        const stored = registration('run-1', {
          eventResult: {
            tasks: [
              { index: 0, points: 13, stationId: 'post-3', updatedAt: 't1', updatedBy: 'u' },
              { index: 0, points: 11, stationId: 'post-1', updatedAt: 't1', updatedBy: 'u' },
            ],
            updatedAt: 't1',
            updatedBy: 'u',
          },
        })

        const [entry] = stationEntryResponse(corrected, third, [stored]).registrations

        expect(entry.eventResult?.tasks).toEqual([byExercise(3, 13)])
      })
    })
  })

  describe('scopeResultToStation', () => {
    it('strips the derived prize and the other posts, keeping the version stamps', () => {
      const result: ExerciseEventResult = {
        elimination: { exercise: 2, fault: 'hardMouth' },
        maxPoints: 80,
        percentage: 81.25,
        points: 65,
        result: 'AVO1',
        tasks: [
          { exercise: 1, part: 0, points: 17, updatedAt: 't1', updatedBy: 'u' },
          { exercise: 2, part: 0, points: 12, updatedAt: 't2', updatedBy: 'u' },
        ],
        updatedAt: 't2',
        updatedBy: 'u',
      }

      // The post does exercise 1 of the dog's running order.
      expect(scopeResultToStation(result, [1], 'NOWT')).toEqual({
        elimination: { exercise: 2, fault: 'hardMouth' },
        tasks: [{ exercise: 1, part: 0, points: 17, updatedAt: 't1', updatedBy: 'u' }],
        updatedAt: 't2',
        updatedBy: 'u',
      })
    })

    it("keeps a qualitative type's result and judge, which are the post's own recording", () => {
      const judge = { id: 123, name: 'Tuomari' }
      const result: ExerciseEventResult = { judge, result: 'ALO1', updatedAt: 't1', updatedBy: 'u' }

      expect(scopeResultToStation(result, [], 'NOME-B')).toEqual({
        judge,
        result: 'ALO1',
        updatedAt: 't1',
        updatedBy: 'u',
      })
      // A NOWT's result is derived from posts this link cannot see, so it stays off.
      expect(scopeResultToStation(result, [1], 'NOWT')).toEqual({ updatedAt: 't1', updatedBy: 'u' })
    })
  })
})
