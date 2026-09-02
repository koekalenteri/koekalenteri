import type { JsonEventResult, JsonRegistration } from '../../types'
import { asJsonConfirmedEvent, asJsonRegistration } from '../test-utils/helpers'
import {
  authorizeStationEntry,
  deriveStationEntryToken,
  getStationEntryToken,
  scopeResultToStation,
  stationEntryResponse,
} from './stationEntry'

const station = { date: '2026-09-12', id: 'post-1', number: 1, tasks: 1 as const }

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

    it('opens the station for the right token only', async () => {
      const token = await getStationEntryToken('event-1', station)

      await expect(authorizeStationEntry(headers(token), 'event-1', confirmedEvent, 'post-1')).resolves.toMatchObject({
        id: 'post-1',
      })

      // A wrong token, a missing one and an unknown station all read the same from outside.
      await expect(authorizeStationEntry(headers('wrong'), 'event-1', confirmedEvent, 'post-1')).rejects.toThrow(
        'not found'
      )
      await expect(authorizeStationEntry(headers(), 'event-1', confirmedEvent, 'post-1')).rejects.toThrow('not found')
      await expect(authorizeStationEntry(headers(token), 'event-1', confirmedEvent, 'post-9')).rejects.toThrow(
        'not found'
      )
    })

    it('opens the implicit post of a single-post format, which has nothing stored to find', async () => {
      const singlePost = asJsonConfirmedEvent({ ...confirmedEvent, eventType: 'NOME-B', stations: undefined })
      const token = await getStationEntryToken('event-1', { id: '1' })

      await expect(authorizeStationEntry(headers(token), 'event-1', singlePost, '1')).resolves.toMatchObject({
        date: '2026-09-12',
        id: '1',
        number: 1,
        tasks: 1,
      })
      // A NOWT with no course laid out has no post at all, implicit or otherwise.
      await expect(
        authorizeStationEntry(headers(token), 'event-1', { ...confirmedEvent, stations: undefined }, '1')
      ).rejects.toThrow('not found')
    })

    it('closes the implicit post to the old link once its version has been written down', async () => {
      const revoked = { date: '2026-09-12', id: '1', number: 1, tasks: 1 as const, tokenVersion: 2 }
      const singlePost = asJsonConfirmedEvent({ ...confirmedEvent, eventType: 'NOME-B', stations: [revoked] })
      const before = await getStationEntryToken('event-1', { id: '1' })
      const after = await getStationEntryToken('event-1', revoked)

      await expect(authorizeStationEntry(headers(before), 'event-1', singlePost, '1')).rejects.toThrow('not found')
      await expect(authorizeStationEntry(headers(after), 'event-1', singlePost, '1')).resolves.toMatchObject({
        tokenVersion: 2,
      })
    })

    it('rejects a token minted for another station or event', async () => {
      const other = await getStationEntryToken('event-2', station)

      await expect(authorizeStationEntry(headers(other), 'event-1', confirmedEvent, 'post-1')).rejects.toThrow(
        'not found'
      )
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

    it('serves the minimum a post needs to call dogs up, and nothing personal', () => {
      const result = stationEntryResponse(confirmedEvent, station, [registration('run-1')])
      const dog = result.registrations[0]

      expect(dog).toEqual({
        class: 'ALO',
        dog: { name: 'Dog run-1' },
        eventType: 'NOWT',
        group: { date: '2026-09-12', key: 'ALO-AP', number: 1, time: 'ap' },
        id: 'run-1',
      })
      // The link is shared on paper at a venue; contact details must not ride on it.
      expect(JSON.stringify(result)).not.toContain('example.com')
      expect(JSON.stringify(result)).not.toContain('regNo')
    })

    it("serves a qualitative type's verdict, so the link can show who is done", () => {
      const judge = { id: 123, name: 'Tuomari' }
      const singlePost = asJsonConfirmedEvent({ ...confirmedEvent, eventType: 'NOME-B', stations: undefined })
      const scored = registration('run-1', {
        eventResult: { judge, result: 'ALO1', updatedAt: 't1', updatedBy: 'u' },
        eventType: 'NOME-B',
      })
      const implicit = { date: '2026-09-12', id: '1', number: 1, tasks: 1 as const }

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
      expect(dog.eventResult?.tasks?.[0]).toMatchObject({ points: 17, stationId: 'post-1' })
    })
  })

  describe('scopeResultToStation', () => {
    it('strips the derived prize and the other posts, keeping the version stamps', () => {
      const result: JsonEventResult = {
        elimination: { fault: 'hardMouth', stationId: 'post-2' },
        maxPoints: 80,
        percentage: 81.25,
        points: 65,
        result: 'AVO1',
        tasks: [
          { index: 0, points: 17, stationId: 'post-1', updatedAt: 't1', updatedBy: 'u' },
          { index: 0, points: 12, stationId: 'post-2', updatedAt: 't2', updatedBy: 'u' },
        ],
        updatedAt: 't2',
        updatedBy: 'u',
      }

      expect(scopeResultToStation(result, 'post-1', 'NOWT')).toEqual({
        elimination: { fault: 'hardMouth', stationId: 'post-2' },
        tasks: [{ index: 0, points: 17, stationId: 'post-1', updatedAt: 't1', updatedBy: 'u' }],
        updatedAt: 't2',
        updatedBy: 'u',
      })
    })

    it("keeps a qualitative type's result and judge, which are the post's own recording", () => {
      const judge = { id: 123, name: 'Tuomari' }
      const result: JsonEventResult = { judge, result: 'ALO1', updatedAt: 't1', updatedBy: 'u' }

      expect(scopeResultToStation(result, '1', 'NOME-B')).toEqual({
        judge,
        result: 'ALO1',
        updatedAt: 't1',
        updatedBy: 'u',
      })
      // A NOWT's result is derived from posts this link cannot see, so it stays off.
      expect(scopeResultToStation(result, 'post-1', 'NOWT')).toEqual({ updatedAt: 't1', updatedBy: 'u' })
    })
  })
})
