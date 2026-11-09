import type { DogEvent } from '@/types'
import { act, renderHook } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { MemoryRouter } from 'react-router'
import { eventWithStaticDates } from '@/__mockData__/events'
import { putEvent } from '@/api/event'
import { TestProvider } from '@/test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '@/test-utils/utils'
import { idTokenAtom } from '../../state'
import { adminEventIdAtom, adminEventsAtom } from '../state'
import useEventForm from './useEventForm'

vi.mock('@/api/event')

// The view's draft as a store reads it, not a mocked atom: what a view opens on is the point (KOE-1700).
const DRAFT_KEY = `adminEditableEvent/edit/Id__${eventWithStaticDates.id}`
const draft: DogEvent = { ...eventWithStaticDates, location: 'Luonnoksen paikka' }
const savedSince: DogEvent = {
  ...eventWithStaticDates,
  modifiedAt: new Date(eventWithStaticDates.modifiedAt.getTime() + 60_000),
}

const wrapperFor =
  (stored: DogEvent) =>
  ({ children }: { readonly children: React.ReactNode }) => (
    <TestProvider
      initializeState={({ set }) => {
        set(idTokenAtom, TEST_ID_TOKEN)
        set(adminEventsAtom, [stored])
        set(adminEventIdAtom, stored.id)
      }}
    >
      <SnackbarProvider>
        <MemoryRouter>{children}</MemoryRouter>
      </SnackbarProvider>
    </TestProvider>
  )

describe('useEventForm over a draft begun before the last save of the event (KOE-1700)', () => {
  beforeEach(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)))
  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
  })

  it('opens on the event as stored, drops the draft, and saves against the stored stamp', async () => {
    vi.mocked(putEvent).mockResolvedValueOnce(savedSince)
    const shown: DogEvent[] = []
    const { result } = renderHook(
      () => {
        const form = useEventForm({ eventId: savedSince.id, form: 'edit', storedEvent: savedSince })
        shown.push(form.event)
        return form
      },
      { wrapper: wrapperFor(savedSince) }
    )

    expect(shown[0]).toBe(savedSince)
    expect(result.current.canSave).toBe(false)
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()

    act(() => result.current.handleChange({ ...result.current.event, location: 'Uusi paikka' }))
    await act(() => result.current.handleSave())

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'Uusi paikka', modifiedAt: savedSince.modifiedAt }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
  })

  it('keeps a change made while the view is open when the event is saved meanwhile', () => {
    const opened: { storedEvent: DogEvent } = { storedEvent: eventWithStaticDates }
    const { rerender, result } = renderHook(
      ({ storedEvent }) => useEventForm({ eventId: storedEvent.id, form: 'edit', storedEvent }),
      { initialProps: opened, wrapper: wrapperFor(eventWithStaticDates) }
    )
    expect(result.current.event).toMatchObject({ location: draft.location })

    rerender({ storedEvent: savedSince })

    expect(result.current.event).toMatchObject({ location: draft.location })
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })

  it('keeps the draft of an event no longer stored, as all there is of it', () => {
    const gone: DogEvent = { ...savedSince, id: '' }
    const { result } = renderHook(
      () => useEventForm({ eventId: eventWithStaticDates.id, form: 'edit', storedEvent: gone }),
      { wrapper: wrapperFor(gone) }
    )

    expect(result.current.event).toMatchObject({ location: draft.location })
    expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull()
  })
})
