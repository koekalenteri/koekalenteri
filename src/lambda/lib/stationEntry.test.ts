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

      expect(scopeResultToStation(result, 'post-1')).toEqual({
        elimination: { fault: 'hardMouth', stationId: 'post-2' },
        tasks: [{ index: 0, points: 17, stationId: 'post-1', updatedAt: 't1', updatedBy: 'u' }],
        updatedAt: 't2',
        updatedBy: 'u',
      })
    })
  })
})
