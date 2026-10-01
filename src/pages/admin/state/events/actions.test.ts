import { act, renderHook } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { createElement } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { exportEventToStage, putEvent } from '@/api/event'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
import {
  buildEventSavePatch,
  buildResultsPublishedPatch,
  buildStartListClassPublishedPatch,
  buildStartListPublishedPatch,
  useAdminEventActions,
} from './actions'
import { adminEventIdAtom } from './atoms'
import { adminEventAtom } from './derivedAtoms'

vi.mock('@/api/event')
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

describe('buildResultsPublishedPatch', () => {
  it('uses an event-level boolean for events without classes (KOE-1464)', () => {
    expect(buildResultsPublishedPatch(eventWithStaticDates, undefined, true)).toEqual({
      id: eventWithStaticDates.id,
      resultsPublished: true,
    })
  })

  it('keeps the other classes when publishing one', () => {
    const event = {
      ...eventWithStaticDates,
      classes: [
        { class: 'ALO' as const, date: eventWithStaticDates.startDate },
        { class: 'AVO' as const, date: eventWithStaticDates.startDate },
      ],
      resultsPublished: { AVO: true },
    }

    expect(buildResultsPublishedPatch(event, 'ALO', true)).toEqual({
      id: eventWithStaticDates.id,
      resultsPublished: { ALO: true, AVO: true },
    })
  })
})

describe('useAdminEventActions.setResultsPublished', () => {
  const classless = { ...eventWithStaticDates, id: 'classless-results' }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })
  afterEach(() => localStorage.removeItem('idToken'))

  it('saves the one flag of a classless event (KOE-1464)', async () => {
    vi.mocked(putEvent).mockResolvedValueOnce({ ...classless, resultsPublished: true })
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    const saved = await act(() => result.current.setResultsPublished(classless, undefined, true))

    expect(putEvent).toHaveBeenCalledWith({ id: classless.id, resultsPublished: true }, TEST_ID_TOKEN)
    expect(saved).toMatchObject({ resultsPublished: true })
  })

  it('saves nothing when the flag already reads that way', async () => {
    const published = { ...classless, resultsPublished: true }
    const { result } = renderHook(() => useAdminEventActions(), { wrapper: Provider })

    await expect(result.current.setResultsPublished(published, undefined, true)).resolves.toBe(published)
    expect(putEvent).not.toHaveBeenCalled()
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
