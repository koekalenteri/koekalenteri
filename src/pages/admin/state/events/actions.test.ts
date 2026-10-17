import type { StationTurn } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { createElement } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { exportEventToStage, putEvent, putResultsPublished } from '@/api/event'
import { putStationTurn } from '@/api/station'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
import {
  buildEventSavePatch,
  buildStartListClassPublishedPatch,
  buildStartListPublishedPatch,
  useAdminEventActions,
} from './actions'
import { adminEventIdAtom, adminEventsAtom } from './atoms'
import { adminEventAtom } from './derivedAtoms'

vi.mock('@/api/event')
vi.mock('@/api/station')
vi.mock('@/api/user')

describe('buildEventSavePatch', () => {
  it('serializes removed top-level fields as null patch markers', () => {
    const current = { ...eventWithStaticDates, kcId: 123456 }
    const { kcId: _kcId, ...event } = current

    expect(buildEventSavePatch(event, current)).toEqual({
      id: current.id,
      kcId: null,
    })
  })

  it('never sends the results flag, which only its own endpoint changes (KOE-1510)', () => {
    const current = { ...eventWithStaticDates, resultsPublished: true }

    // A full save of a new or other event, and a diff in which the form's copy of the flag is stale.
    expect(buildEventSavePatch({ ...current, id: '' }, current)).not.toHaveProperty('resultsPublished')
    expect(buildEventSavePatch({ ...current, name: 'Uusi', resultsPublished: false }, current)).toEqual({
      id: current.id,
      name: 'Uusi',
    })
    expect(buildEventSavePatch(current, current, { name: 'Uusi', resultsPublished: false })).toEqual({
      id: current.id,
      name: current.name,
    })
  })

  it('materializes arrays from sparse form diffs', () => {
    const current = {
      ...eventWithStaticDates,
      classes: [{ class: 'ALO' as const, date: eventWithStaticDates.startDate, places: 1 }],
    }
    const event = {
      ...current,
      classes: [{ class: 'ALO' as const, date: eventWithStaticDates.startDate, places: 2 }],
    }

    // Deliberately an object where the type wants an array, as DynamoDB marshalling can produce
    expect(
      buildEventSavePatch(event, current, { classes: { 0: { places: 2 } } } as unknown as Parameters<
        typeof buildEventSavePatch
      >[2])
    ).toEqual({
      classes: event.classes,
      id: current.id,
    })
  })
})

describe('buildStartListClassPublishedPatch', () => {
  it('preserves legacy event-level published state for other classes when unpublishing one class', () => {
    expect(
      buildStartListClassPublishedPatch(
        {
          ...eventWithStaticDates,
          classes: [
            { class: 'ALO', date: eventWithStaticDates.startDate },
            { class: 'AVO', date: eventWithStaticDates.startDate },
          ],
          startListPublished: true,
        },
        'ALO',
        false
      )
    ).toEqual({
      id: eventWithStaticDates.id,
      startListPublished: { ALO: false, AVO: true },
    })
  })

  it('does not publish the other classes of a trial whose absent flag the workflow never carried to invited', () => {
    expect(
      buildStartListClassPublishedPatch(
        {
          ...eventWithStaticDates,
          classes: [
            { class: 'ALO', date: eventWithStaticDates.startDate },
            { class: 'AVO', date: eventWithStaticDates.startDate },
          ],
          startListPublished: undefined,
          state: 'picked',
        },
        'ALO',
        true
      )
    ).toEqual({
      id: eventWithStaticDates.id,
      startListPublished: { ALO: true, AVO: false },
    })
  })
})

describe('buildStartListPublishedPatch', () => {
  it('uses an event-level boolean for events without classes', () => {
    expect(buildStartListPublishedPatch(eventWithStaticDates, false)).toEqual({
      id: eventWithStaticDates.id,
      startListPublished: false,
    })
  })
})

describe('useAdminEventActions.setResultsPublished', () => {
  const classless = { ...eventWithStaticDates, id: 'classless-results' }
  const twoDays = {
    ...eventWithStaticDates,
    classes: [
      { class: 'ALO' as const, date: new Date('2021-02-10') },
      { class: 'ALO' as const, date: new Date('2021-02-11') },
    ],
    id: 'two-day-results',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })
  afterEach(() => localStorage.removeItem('idToken'))

  it('asks the server for the one day, never sending a flag of its own (KOE-1510)', async () => {
    vi.mocked(putResultsPublished).mockResolvedValueOnce({
      event: { ...twoDays, resultsPublished: { ALO: ['2021-02-10'] } },
    })
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    const saved = await act(() => result.current.setResultsPublished(twoDays, 'ALO', '2021-02-10', true))

    expect(putResultsPublished).toHaveBeenCalledWith(
      twoDays.id,
      { date: '2021-02-10', eventClass: 'ALO', published: true },
      TEST_ID_TOKEN
    )
    expect(putEvent).not.toHaveBeenCalled()
    expect(saved).toMatchObject({ resultsPublished: { ALO: ['2021-02-10'] } })
  })

  it('hides a published day, which a class-wide reading would have skipped', async () => {
    // The class as a whole is not published (day two is not), so only the day can tell a hide is due.
    const firstDay = { ...twoDays, resultsPublished: { ALO: ['2021-02-10'] } }
    vi.mocked(putResultsPublished).mockResolvedValueOnce({ event: { ...twoDays, resultsPublished: { ALO: false } } })
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    const saved = await act(() => result.current.setResultsPublished(firstDay, 'ALO', '2021-02-10', false))

    expect(putResultsPublished).toHaveBeenCalledWith(
      twoDays.id,
      { date: '2021-02-10', eventClass: 'ALO', published: false },
      TEST_ID_TOKEN
    )
    expect(saved).toMatchObject({ resultsPublished: { ALO: false } })
  })

  it('names the day of a classless event too', async () => {
    vi.mocked(putResultsPublished).mockResolvedValueOnce({ event: { ...classless, resultsPublished: ['2021-02-10'] } })
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    await act(() => result.current.setResultsPublished(classless, undefined, '2021-02-10', true))

    expect(putResultsPublished).toHaveBeenCalledWith(
      classless.id,
      { date: '2021-02-10', eventClass: undefined, published: true },
      TEST_ID_TOKEN
    )
  })

  it('saves nothing when the day already reads that way', async () => {
    const published = { ...classless, resultsPublished: true }
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    await expect(result.current.setResultsPublished(published, undefined, '2021-02-11', true)).resolves.toBe(published)
    expect(putResultsPublished).not.toHaveBeenCalled()
  })
})

/**
 * A past trial whose invitations were never sent has no flag, and the panel shows its list as
 * unpublished. Reading the absent flag as published here returned before the save, so the publish
 * reported success and changed nothing (KOE-1465).
 */
describe('useAdminEventActions start list publishing', () => {
  const pastPicked = {
    ...eventWithStaticDates,
    id: 'past-picked',
    startListPublished: undefined,
    state: 'picked' as const,
  }
  const classed = {
    ...pastPicked,
    classes: [
      { class: 'ALO' as const, date: eventWithStaticDates.startDate },
      { class: 'AVO' as const, date: eventWithStaticDates.startDate },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })
  afterEach(() => localStorage.removeItem('idToken'))

  it('saves the publish of a classless trial that never sent invitations', async () => {
    vi.mocked(putEvent).mockResolvedValueOnce({ ...pastPicked, startListPublished: true })
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    const saved = await act(() => result.current.setStartListPublished(pastPicked, true))

    expect(putEvent).toHaveBeenCalledWith({ id: pastPicked.id, startListPublished: true }, TEST_ID_TOKEN)
    expect(saved).toMatchObject({ startListPublished: true })
  })

  it('saves the publish of one class, leaving the others unpublished', async () => {
    vi.mocked(putEvent).mockResolvedValueOnce({ ...classed, startListPublished: { ALO: true, AVO: false } })
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    await act(() => result.current.setStartListClassPublished(classed, 'ALO', true))

    expect(putEvent).toHaveBeenCalledWith(
      { id: classed.id, startListPublished: { ALO: true, AVO: false } },
      TEST_ID_TOKEN
    )
  })

  it.each([
    { event: { ...pastPicked, state: 'invited' as const }, published: true },
    { event: pastPicked, published: false },
  ])('saves nothing when the list already reads $published', async ({ event, published }) => {
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    await expect(result.current.setStartListPublished(event, published)).resolves.toBe(event)
    expect(putEvent).not.toHaveBeenCalled()
  })
})

describe('useAdminEventActions.copyCurrentToEnvironment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })
  afterEach(() => localStorage.clear())

  it('copies the selected event into the chosen environment (KOE-1471)', async () => {
    const store = createStore()
    store.set(adminEventAtom(eventWithStaticDates.id), eventWithStaticDates)
    store.set(adminEventIdAtom, eventWithStaticDates.id)
    const { result } = renderHook(() => useAdminEventActions(), {
      wrapper: ({ children }) => createElement(Provider, { store }, children),
    })

    const copied = await act(() => result.current.copyCurrentToEnvironment('test'))

    expect(exportEventToStage).toHaveBeenCalledWith(eventWithStaticDates.id, 'test', TEST_ID_TOKEN)
    expect(copied).toEqual({ eventId: 'copied-event', judges: [], target: 'test' })
  })

  it('sends nothing without a selected event', async () => {
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    await expect(result.current.copyCurrentToEnvironment('test')).resolves.toBeUndefined()
    expect(exportEventToStage).not.toHaveBeenCalled()
  })
})

describe('useAdminEventActions.recordStationTurn', () => {
  const turns: StationTurn[] = [
    { dogs: [], id: 'turn-1', registrationIds: [], startedAt: new Date('2026-09-30T08:00:00Z'), stationId: '1' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
    vi.mocked(putStationTurn).mockResolvedValueOnce({ turns })
  })
  afterEach(() => localStorage.clear())

  const renderWithEvents = (events: (typeof eventWithStaticDates)[]) => {
    const store = createStore()
    store.set(adminEventsAtom, events)
    const { result } = renderHook(() => useAdminEventActions(), {
      wrapper: ({ children }) => createElement(Provider, { store }, children),
    })
    return { result, store }
  }

  it('writes the answered timeline onto the stored event', async () => {
    const { result, store } = renderWithEvents([eventWithStaticDates])

    await act(() => result.current.recordStationTurn(eventWithStaticDates.id, { type: 'end' }))

    expect(store.get(adminEventAtom(eventWithStaticDates.id))).toMatchObject({ turns })
  })

  it('stores nothing for an event this browser does not hold', async () => {
    const { result, store } = renderWithEvents([])

    await expect(act(() => result.current.recordStationTurn('elsewhere', { type: 'end' }))).resolves.toEqual(turns)
    expect(await store.get(adminEventsAtom)).toEqual([])
  })
})
