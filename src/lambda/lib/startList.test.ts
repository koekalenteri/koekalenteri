import type { JsonEventResult } from '../../types'
import { vi } from 'vitest'
import { asJsonConfirmedEvent, asJsonRegistration, eventNotFound } from '../test-utils/helpers'

const mockGetLiveEvent = vi.fn()
const mockReadEventRegistrations = vi.fn()

vi.doMock('./event', () => ({ getLiveEvent: mockGetLiveEvent }))
vi.doMock('./repositories/registrationRepository', () => ({
  readEventRegistrations: mockReadEventRegistrations,
}))

const { readPublishedStartList } = await import('./startList')

const publishedEvent = asJsonConfirmedEvent({
  classes: [{ class: 'ALO', state: 'invited' }],
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
  startDate: '2025-01-01',
  startListPublished: { ALO: true },
  startNumbersPublished: { ALO: true },
  state: 'invited',
})

const registration = asJsonRegistration({
  cancelled: false,
  class: 'ALO',
  dog: { name: 'Aapo', regNo: 'REG-1' },
  eventId: 'event-1',
  group: { date: '2025-01-01', key: 'ALO', number: 1 },
  handler: { name: 'Handler' },
  owner: { name: 'Owner' },
  ownerHandles: false,
  startGroup: { date: '2025-01-01', key: 'ALO', number: 1 },
})

const STAMP = Date.parse('2025-01-01T10:00:00.000Z')

describe('readPublishedStartList (KOE-1516)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ now: STAMP, toFake: ['Date'] })
    mockGetLiveEvent.mockResolvedValue(publishedEvent)
    mockReadEventRegistrations.mockResolvedValue([registration])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the event and its registrations consistently and composes the published rows', async () => {
    await expect(readPublishedStartList('event-1')).resolves.toEqual({
      available: true,
      participants: [expect.objectContaining({ dog: { name: 'Aapo', regNo: 'REG-1' }, handler: 'Handler' })],
      version: STAMP,
    })

    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockReadEventRegistrations).toHaveBeenCalledWith('event-1', true)
  })

  it('stamps the version before reading, so a later stamp never describes an earlier read', async () => {
    mockGetLiveEvent.mockImplementationOnce(async () => {
      vi.setSystemTime(STAMP + 5000)
      return publishedEvent
    })

    await expect(readPublishedStartList('event-1')).resolves.toEqual(expect.objectContaining({ version: STAMP }))
  })

  it('reads a list that is not available as no rows, without reading the registrations', async () => {
    mockGetLiveEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1')).resolves.toEqual({
      available: false,
      participants: [],
      version: STAMP,
    })
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('composes an unpublished list for a preview', async () => {
    mockGetLiveEvent.mockResolvedValueOnce({ ...publishedEvent, startListPublished: { ALO: false } })

    await expect(readPublishedStartList('event-1', { preview: true })).resolves.toEqual(
      expect.objectContaining({ available: true, participants: [expect.objectContaining({ handler: 'Handler' })] })
    )
    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
  })

  // KOE-1586: the public list of a deleted event was still served.
  it('answers a deleted event as a missing one, without reading the registrations', async () => {
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('event-1'))

    await expect(readPublishedStartList('event-1')).rejects.toMatchObject({ status: 404 })

    expect(mockGetLiveEvent).toHaveBeenCalledWith('event-1', true)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('answers a deleted event as a missing one for the preview too', async () => {
    mockGetLiveEvent.mockRejectedValueOnce(eventNotFound('event-1'))

    await expect(readPublishedStartList('event-1', { preview: true })).rejects.toMatchObject({ status: 404 })
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  it('lets the caller refuse the event before any registration is read', async () => {
    const checkEvent = vi.fn(() => {
      throw new Error('Forbidden')
    })

    await expect(readPublishedStartList('event-1', { checkEvent })).rejects.toThrow('Forbidden')

    expect(checkEvent).toHaveBeenCalledWith(publishedEvent)
    expect(mockReadEventRegistrations).not.toHaveBeenCalled()
  })

  // KOE-1489: the whole stored dog went out to every reader. What is compared is the JSON the reader
  // gets, since that is what the response and the live message carry.
  describe('the published dog', () => {
    const sentDog = async () => {
      const { participants } = await readPublishedStartList('event-1')
      return JSON.parse(JSON.stringify(participants))[0].dog
    }

    it('publishes only the dog fields the start list shows', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce([
        {
          ...registration,
          dog: {
            breedCode: '122',
            callingName: 'Kutsumanimi',
            dam: { name: 'Emä', regNo: 'FI-D', titles: 'FI MVA' },
            dob: '2020-02-03',
            gender: 'F',
            kcId: 12345,
            name: 'Aapo',
            refreshDate: '2025-01-01T10:00:00.000Z',
            regNo: 'REG-1',
            results: [
              {
                class: 'ALO',
                date: '2024-06-01',
                judge: 'Tuomari',
                location: 'Paikka',
                result: 'ALO1',
                type: 'NOME-B',
              },
            ],
            rfid: '246000000000001',
            rfidEditable: false,
            sire: { name: 'Isä', regNo: 'FI-S', titles: 'C.I.B.' },
            titles: 'FI KVA-WT',
          },
        },
      ])

      await expect(sentDog()).resolves.toStrictEqual({
        breedCode: '122',
        dam: { name: 'Emä', titles: 'FI MVA' },
        dob: '2020-02-03',
        gender: 'F',
        name: 'Aapo',
        regNo: 'REG-1',
        sire: { name: 'Isä', titles: 'C.I.B.' },
        titles: 'FI KVA-WT',
      })
    })

    it('sends no parents for a dog without them', async () => {
      await expect(sentDog()).resolves.toStrictEqual({ name: 'Aapo', regNo: 'REG-1' })
    })
  })

  describe('placement', () => {
    const resultsEvent = {
      ...publishedEvent,
      classes: [{ class: 'ALO', state: 'ended' as const }],
      eventType: 'NOWT',
      resultsPublished: { ALO: true },
      state: 'ended' as const,
    }
    const scored = (id: string, result: string, points: number) =>
      asJsonRegistration({
        ...registration,
        eventResult: { maxPoints: 100, points, result, updatedAt: '', updatedBy: '' },
        eventType: 'NOWT',
        group: { date: '2025-01-01', key: 'participants', number: 1 },
        id,
      })

    it('publishes the rank beside the result, ties sharing one', async () => {
      mockGetLiveEvent.mockResolvedValue(resultsEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scored('a', 'ALO1', 90),
        scored('b', 'ALO2', 70),
        scored('c', 'ALO2', 70),
        scored('d', 'ALO0', 40),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants.map(({ placement, result }) => [result, placement])).toEqual([
        ['ALO1', 1],
        ['ALO2', 2],
        ['ALO2', 2],
        ['ALO0', undefined],
      ])
    })

    it('counts a dog whose row is withheld in the rank of the published ones', async () => {
      mockGetLiveEvent.mockResolvedValue(resultsEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scored('a', 'ALO2', 70),
        // Its number is not entered yet, so it stays off the list, but it still ran ahead of the others.
        { ...scored('w', 'ALO1', 95), startGroup: undefined },
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ placement: 2, result: 'ALO2' })])
    })

    it('publishes a NOME-A result as Kennelliitto lists it, while the stored one keeps its prefix (KOE-1592)', async () => {
      mockGetLiveEvent.mockResolvedValue({
        ...resultsEvent,
        classes: [],
        eventType: 'NOME-A',
        resultsPublished: true,
        startListPublished: true,
        startNumbersPublished: true,
      })
      mockReadEventRegistrations.mockResolvedValue([
        asJsonRegistration({
          ...registration,
          class: undefined,
          eventResult: { result: 'NOME-A1', updatedAt: '', updatedBy: '' },
          eventType: 'NOME-A',
          group: { date: '2025-01-01', key: 'participants', number: 1 },
          startGroup: { date: '2025-01-01', key: 'participants', number: 1 },
        }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ result: 'A1' })])
    })

    it('withholds the rank where the results are not published', async () => {
      mockGetLiveEvent.mockResolvedValue({ ...resultsEvent, resultsPublished: { ALO: false } })
      mockReadEventRegistrations.mockResolvedValue([scored('a', 'ALO1', 90)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      expect(participants[0]).not.toHaveProperty('placement')
    })
  })

  describe('totals (KOE-1673)', () => {
    // Two posts of one exercise each, worth 20 apiece, so the dog's round is worth 40.
    const scoredEvent = {
      ...publishedEvent,
      classes: [{ class: 'ALO', state: 'ended' as const }],
      eventType: 'NOWT',
      resultsPublished: { ALO: true },
      state: 'ended' as const,
      stations: [1, 2].map((number) => ({ date: '2025-01-01', id: `post-${number}`, number })),
    }
    const at = { updatedAt: '2025-01-01T09:00:00.000Z', updatedBy: 'Sihteeri' }
    const scoredRow = (eventResult: JsonEventResult, eventType = 'NOWT') =>
      asJsonRegistration({
        ...registration,
        eventResult,
        eventType,
        group: { date: '2025-01-01', key: 'participants', number: 1 },
      })
    const awarded: JsonEventResult = { ...at, maxPoints: 40, percentage: 82.5, points: 33, result: 'ALO1' }

    it('publishes the points, the maximum and the percentage with the result', async () => {
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([scoredRow(awarded)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([
        expect.objectContaining({ maxPoints: 40, percentage: 82.5, placement: 1, points: 33, result: 'ALO1' }),
      ])
    })

    it('withholds them where the results are not published', async () => {
      mockGetLiveEvent.mockResolvedValue({ ...scoredEvent, resultsPublished: { ALO: false } })
      mockReadEventRegistrations.mockResolvedValue([scoredRow(awarded)])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })

    it('works out what a round that ended early earned when it was stored without totals (KOE-1669)', async () => {
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({
          ...at,
          result: 'ALO-',
          retirement: { cause: 'injury', exercise: 2 },
          tasks: [{ ...at, exercise: 1, part: 0, points: 12 }],
        }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([
        expect.objectContaining({ marks: ['interrupted'], maxPoints: 40, percentage: 30, points: 12, result: 'ALO-' }),
      ])
      // A dash takes no rank, whatever it earned.
      expect(participants[0]).not.toHaveProperty('placement')
    })

    it('publishes none for a dog whose round has no result yet', async () => {
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({
          ...at,
          maxPoints: 40,
          percentage: 50,
          points: 20,
          tasks: [{ ...at, exercise: 1, part: 0, points: 20 }],
        }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toHaveLength(1)
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })

    it('publishes none for a round without a maximum', async () => {
      // What a scored type stores when its round has no scorable exercise: totals of nothing.
      mockGetLiveEvent.mockResolvedValue(scoredEvent)
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({ ...at, maxPoints: 0, percentage: 0, points: 0, result: 'ALO0' }),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ result: 'ALO0' })])
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })

    it('publishes none for a type not scored at posts', async () => {
      // Tasks and totals a qualitative row never holds, so neither the fill-in nor the publication may
      // read them: only a type scored at posts has totals to show.
      mockGetLiveEvent.mockResolvedValue({ ...scoredEvent, eventType: 'NOME-B' })
      mockReadEventRegistrations.mockResolvedValue([
        scoredRow({ ...at, result: 'ALO1', tasks: [{ ...at, exercise: 1, part: 0, points: 12 }] }, 'NOME-B'),
      ])

      const { participants } = await readPublishedStartList('event-1')

      expect(participants).toEqual([expect.objectContaining({ result: 'ALO1' })])
      for (const key of ['points', 'maxPoints', 'percentage']) expect(participants[0]).not.toHaveProperty(key)
    })
  })

  // KOE-1715: the public sees the dogs by team. The teams name their dogs by registration id, so the
  // event's teams never leave the server; each published row carries its own team instead.
  describe('teams', () => {
    const member = (id: string, name: string, number: number) =>
      asJsonRegistration({
        ...registration,
        dog: { name, regNo: `REG-${id}` },
        group: { date: '2025-01-01', key: 'ALO', number },
        id,
        startGroup: { date: '2025-01-01', key: 'ALO', number },
      })
    // A reserve: entered, but on no list.
    const reserve = asJsonRegistration({ ...registration, group: undefined, id: 'reserve', startGroup: undefined })
    const cancelled = asJsonRegistration({ ...member('gone', 'Poissa', 3), cancelled: true })

    const teamEvent = {
      ...publishedEvent,
      teams: [{ name: 'Team Finland 1', registrationIds: ['a', 'reserve', 'b'] }, { registrationIds: ['gone', 'c'] }],
    }

    const sent = async () => {
      const { participants } = await readPublishedStartList('event-1')
      return JSON.parse(JSON.stringify(participants))
    }

    beforeEach(() => {
      mockGetLiveEvent.mockResolvedValue(teamEvent)
      mockReadEventRegistrations.mockResolvedValue([
        member('a', 'Aapo', 1),
        member('b', 'Bella', 2),
        cancelled,
        member('c', 'Cesar', 4),
        member('d', 'Dora', 5),
        reserve,
      ])
    })

    it('gives each published member its team number, name and code', async () => {
      const rows = await sent()

      expect(rows.map((row: { dog: { name: string }; team?: unknown }) => [row.dog.name, row.team])).toEqual([
        ['Aapo', { code: '1A', name: 'Team Finland 1', number: 1 }],
        // The reserve keeps its letter, as on the teams page: Bella is 1C, not 1B.
        ['Bella', { code: '1C', name: 'Team Finland 1', number: 1 }],
        ['', undefined],
        ['Cesar', { code: '2B', number: 2 }],
        ['Dora', undefined],
      ])
    })

    it("carries the teams in the organizer's preview of a list not yet published", async () => {
      mockGetLiveEvent.mockResolvedValue({ ...teamEvent, startListPublished: { ALO: false } })

      const { participants } = await readPublishedStartList('event-1', { preview: true })

      expect(participants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            dog: { name: 'Aapo', regNo: 'REG-a' },
            team: expect.objectContaining({ code: '1A' }),
          }),
          expect.objectContaining({
            dog: { name: 'Cesar', regNo: 'REG-c' },
            team: expect.objectContaining({ code: '2B' }),
          }),
        ])
      )
    })

    it('gives a cancelled dog no team, so its narrow row says no more than its number', async () => {
      const rows = await sent()

      expect(rows.find((row: { cancelled?: boolean }) => row.cancelled)).not.toHaveProperty('team')
    })

    it('sends neither the teams nor a registration id', async () => {
      const text = JSON.stringify(await sent())

      for (const id of ['"a"', 'reserve', 'gone', 'registrationIds']) expect(text).not.toContain(id)
    })

    it('gives the rows of an event without teams none', async () => {
      mockGetLiveEvent.mockResolvedValue(publishedEvent)

      const rows = await sent()

      for (const row of rows) expect(row).not.toHaveProperty('team')
    })
  })

  // KOE-1717: each team's points and placing over the trial, once every result they are worked out from is out.
  describe('team standings', () => {
    const at = { updatedAt: '2025-01-01T09:00:00.000Z', updatedBy: 'Sihteeri' }
    const standingsEvent = {
      ...publishedEvent,
      classes: [
        { class: 'ALO', state: 'ended' as const },
        { class: 'AVO', state: 'ended' as const },
      ],
      endDate: '2025-01-02',
      eventType: 'NOWT',
      resultsPublished: { ALO: true, AVO: true },
      startListPublished: { ALO: true, AVO: true },
      startNumbersPublished: { ALO: true, AVO: true },
      state: 'ended' as const,
      teams: [{ registrationIds: ['a', 'b'] }, { name: 'Team Finland 2', registrationIds: ['c', 'd'] }],
    }
    // The ALO dogs run on the first day and the AVO dogs on the second: a team is ranked over both.
    const dog = (id: string, eventClass: 'ALO' | 'AVO', number: number, points: number) =>
      asJsonRegistration({
        ...registration,
        class: eventClass,
        dog: { name: `Dog ${id}`, regNo: `REG-${id}` },
        eventResult: { ...at, maxPoints: 100, percentage: points, points, result: `${eventClass}1` },
        eventType: 'NOWT',
        group: { date: dayOf(eventClass), key: 'participants', number },
        id,
        startGroup: { date: dayOf(eventClass), key: 'participants', number },
      })

    const dayOf = (eventClass: string) => (eventClass === 'ALO' ? '2025-01-01' : '2025-01-02')

    const teamsOf = async (options?: { preview: boolean }) => {
      const { participants } = await readPublishedStartList('event-1', options)
      return Object.fromEntries(participants.map((row) => [row.dog.name, row.team]))
    }

    beforeEach(() => {
      mockGetLiveEvent.mockResolvedValue(standingsEvent)
      mockReadEventRegistrations.mockResolvedValue([
        dog('a', 'ALO', 1, 90),
        dog('b', 'AVO', 2, 80),
        dog('c', 'ALO', 3, 85),
        dog('d', 'AVO', 4, 70),
      ])
    })

    it("gives every member of a team, on every day, the team's points and placing over the trial", async () => {
      const teams = await teamsOf()

      expect(teams).toEqual({
        'Dog a': { code: '1A', number: 1, placement: 1, points: 170 },
        'Dog b': { code: '1B', number: 1, placement: 1, points: 170 },
        'Dog c': { code: '2A', name: 'Team Finland 2', number: 2, placement: 2, points: 155 },
        'Dog d': { code: '2B', name: 'Team Finland 2', number: 2, placement: 2, points: 155 },
      })
    })

    it("withholds every team's standing while one class's results are not published", async () => {
      mockGetLiveEvent.mockResolvedValue({ ...standingsEvent, resultsPublished: { ALO: true, AVO: false } })

      const teams = await teamsOf()

      for (const team of Object.values(teams)) {
        for (const key of ['points', 'placement', 'runOff']) expect(team).not.toHaveProperty(key)
      }
    })

    it("shows the standings in the organizer's preview before the results are out", async () => {
      mockGetLiveEvent.mockResolvedValue({ ...standingsEvent, resultsPublished: { ALO: false, AVO: false } })

      const teams = await teamsOf({ preview: true })

      expect(teams['Dog a']).toEqual(expect.objectContaining({ placement: 1, points: 170 }))
    })

    it('marks the teams tied for first, and puts the winner of the run-off first', async () => {
      mockReadEventRegistrations.mockResolvedValue([
        dog('a', 'ALO', 1, 90),
        dog('b', 'AVO', 2, 80),
        dog('c', 'ALO', 3, 85),
        dog('d', 'AVO', 4, 85),
      ])

      expect(await teamsOf()).toEqual(
        expect.objectContaining({
          'Dog a': expect.objectContaining({ placement: 1, points: 170, runOff: true }),
          'Dog c': expect.objectContaining({ placement: 1, points: 170, runOff: true }),
        })
      )

      const [first, second] = standingsEvent.teams
      mockGetLiveEvent.mockResolvedValue({ ...standingsEvent, teams: [first, { ...second, runOffWon: true }] })

      expect(await teamsOf()).toEqual(
        expect.objectContaining({
          'Dog a': expect.objectContaining({ placement: 2, runOff: true }),
          'Dog c': expect.objectContaining({ placement: 1, runOff: true }),
        })
      )
    })

    // KOE-1720: a row names its team's series by id, so a renamed series needs no new list.
    it("gives every member its team's series and the team's placing within it", async () => {
      mockGetLiveEvent.mockResolvedValue({
        ...standingsEvent,
        teamCompetition: {
          series: [
            { id: 'open', name: { fi: 'Avoin' } },
            { id: 'breed', name: { fi: 'Rotu' } },
          ],
        },
        teams: [
          { registrationIds: ['a', 'b'], seriesId: 'open' },
          { name: 'Team Finland 2', registrationIds: ['c', 'd'], seriesId: 'breed' },
        ],
      })

      expect(await teamsOf()).toEqual({
        'Dog a': { code: '1A', number: 1, placement: 1, points: 170, seriesId: 'open' },
        'Dog b': { code: '1B', number: 1, placement: 1, points: 170, seriesId: 'open' },
        'Dog c': { code: '2A', name: 'Team Finland 2', number: 2, placement: 1, points: 155, seriesId: 'breed' },
        'Dog d': { code: '2B', name: 'Team Finland 2', number: 2, placement: 1, points: 155, seriesId: 'breed' },
      })
    })

    it("publishes a series' standings once its own dogs' results are out, whatever another series' are", async () => {
      mockGetLiveEvent.mockResolvedValue({
        ...standingsEvent,
        resultsPublished: { ALO: true, AVO: false },
        teamCompetition: {
          series: [
            { id: 'open', name: { fi: 'Avoin' } },
            { id: 'breed', name: { fi: 'Rotu' } },
          ],
        },
        teams: [
          { registrationIds: ['a'], seriesId: 'open' },
          { registrationIds: ['c'], seriesId: 'open' },
          { registrationIds: ['b', 'd'], seriesId: 'breed' },
        ],
      })

      const teams = await teamsOf()

      expect(teams['Dog a']).toEqual({ code: '1A', number: 1, placement: 1, points: 90, seriesId: 'open' })
      expect(teams['Dog c']).toEqual({ code: '2A', number: 2, placement: 2, points: 85, seriesId: 'open' })
      expect(teams['Dog b']).toEqual({ code: '3A', number: 3, seriesId: 'breed' })
    })

    it('ranks a team added to a published list beside the teams already on it', async () => {
      mockGetLiveEvent.mockResolvedValue({
        ...standingsEvent,
        teams: [...standingsEvent.teams, { registrationIds: ['e'] }],
      })
      mockReadEventRegistrations.mockResolvedValue([
        dog('a', 'ALO', 1, 90),
        dog('b', 'AVO', 2, 80),
        dog('c', 'ALO', 3, 85),
        dog('d', 'AVO', 4, 70),
        dog('e', 'ALO', 5, 160),
      ])

      const teams = await teamsOf()

      expect(teams['Dog a']).toEqual(expect.objectContaining({ placement: 1, points: 170 }))
      expect(teams['Dog e']).toEqual({ code: '3A', number: 3, placement: 2, points: 160 })
      expect(teams['Dog c']).toEqual(expect.objectContaining({ placement: 3, points: 155 }))
    })

    it('gives no standing in a format without points', async () => {
      mockGetLiveEvent.mockResolvedValue({ ...standingsEvent, eventType: 'NOME-B' })

      const teams = await teamsOf()

      expect(teams['Dog a']).toEqual({ code: '1A', number: 1 })
    })

    /** Whether any row carries a team's standing. */
    const anyStanding = (teams: Record<string, unknown>) =>
      Object.values(teams).some((team) => typeof team === 'object' && team !== null && 'points' in team)

    // KOE-1272: a dog added after the numbers went out stays off the list until its number is entered.
    // Its result is released with its class, but the team total would show what its hidden row withholds.
    it('withholds every standing while a counted dog is off the list for a number not yet entered', async () => {
      const late = { ...dog('e', 'AVO', 5, 60), startGroup: undefined }
      mockGetLiveEvent.mockResolvedValue({
        ...standingsEvent,
        teams: [{ registrationIds: ['a', 'b', 'e'] }, standingsEvent.teams[1]],
      })
      mockReadEventRegistrations.mockResolvedValue([
        dog('a', 'ALO', 1, 90),
        dog('b', 'AVO', 2, 80),
        dog('c', 'ALO', 3, 85),
        dog('d', 'AVO', 4, 70),
        late,
      ])

      const teams = await teamsOf()

      expect(teams['Dog a']).toEqual({ code: '1A', number: 1 })
      expect(anyStanding(teams)).toBe(false)
    })

    it('withholds every standing while a counted dog has no day to be listed on', async () => {
      const undated = asJsonRegistration({
        ...dog('e', 'AVO', 5, 60),
        group: { key: 'participants', number: 5 },
        startGroup: undefined,
      })
      mockGetLiveEvent.mockResolvedValue({
        ...standingsEvent,
        teams: [{ registrationIds: ['a', 'b', 'e'] }, standingsEvent.teams[1]],
      })
      mockReadEventRegistrations.mockResolvedValue([
        dog('a', 'ALO', 1, 90),
        dog('b', 'AVO', 2, 80),
        dog('c', 'ALO', 3, 85),
        dog('d', 'AVO', 4, 70),
        undated,
      ])

      expect(anyStanding(await teamsOf())).toBe(false)
    })

    it('publishes the standings beside a cancelled and a reserve member of a class whose results are not out', async () => {
      const voi = { class: 'VOI', state: 'ended' as const }
      mockGetLiveEvent.mockResolvedValue({
        ...standingsEvent,
        classes: [...standingsEvent.classes, voi],
        resultsPublished: { ...standingsEvent.resultsPublished, VOI: false },
        teams: [{ registrationIds: ['a', 'b', 'x', 'r'] }, standingsEvent.teams[1]],
      })
      mockReadEventRegistrations.mockResolvedValue([
        dog('a', 'ALO', 1, 90),
        dog('b', 'AVO', 2, 80),
        dog('c', 'ALO', 3, 85),
        dog('d', 'AVO', 4, 70),
        asJsonRegistration({ ...dog('x', 'AVO', 6, 99), cancelled: true, class: 'VOI' }),
        asJsonRegistration({
          ...dog('r', 'AVO', 7, 99),
          class: 'VOI',
          group: { key: 'reserve', number: 1 },
          startGroup: undefined,
        }),
      ])

      const teams = await teamsOf()

      expect(teams['Dog a']).toEqual(expect.objectContaining({ placement: 1, points: 170 }))
    })
  })
})
