import type { TestStore } from '@/test-utils/AtomProvider'
import type { ConfirmedEvent, DogEvent, Language } from '@/types'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { useState } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { putEvent } from '@/api/event'
import { Path } from '@/routeConfig'
import { renderAdminRoutes } from '@/test-utils/adminRoutes'
import { describeInLanguage } from '@/test-utils/language'
import { flushPromises, runPendingTimers, TEST_ID_TOKEN } from '@/test-utils/utils'
import { adminEventAtom, adminEventIdAtom } from '../state'
import EventDetailsDialog from './EventDetailsDialog'

vi.mock('@/api/user')
vi.mock('@/api/event')
vi.mock('@/api/eventType')
vi.mock('@/api/judge')
vi.mock('@/api/location')
vi.mock('@/api/official')
vi.mock('@/api/organizer')
vi.mock('@/api/registration')

const named: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe', names: { en: 'Spring trial' } }
const finnishOnly: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe' }
// A past trial opens read-only unless it is a draft, and a form with no payment time sets one as it opens.
const editable: DogEvent = { ...named, paymentTime: 'registration', state: 'draft' }

const renderDialog = (event: DogEvent, language: Language = 'fi', onClose?: () => void) =>
  renderAdminRoutes({
    events: [event],
    initialEntry: Path.admin.viewEvent(event.id),
    language,
    routes: [
      { element: <EventDetailsDialog eventId={event.id} onClose={onClose} open />, path: Path.admin.viewEvent() },
    ],
  })

const title = () => screen.getByRole('heading', { level: 2 })

// The event's details open over the entry view titled with the trial's name, in English for a
// secretary browsing in English when the trial has an English name (KOE-1453).
describe('EventDetailsDialog', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    runPendingTimers()
    // The form keeps the event it edits in session storage; the next test opens its own.
    sessionStorage.clear()
    localStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('is titled with the Finnish name in a Finnish view', async () => {
    await renderDialog(named)
    await flushPromises()
    expect(title()).toHaveTextContent('Kevätkoe')
  })

  describeInLanguage('en', () => {
    it.each([
      ['its English name', named, 'Spring trial'],
      ['its Finnish name when it has no English one', finnishOnly, 'Kevätkoe'],
    ])('is titled with %s', async (_case, event, expected) => {
      await renderDialog(event, 'en')
      await flushPromises()
      expect(title()).toHaveTextContent(expected)
    })
  })

  // Closing the dialog any way but Save is the Cancel it offers: the change is not kept for the next
  // opening, where it would wait unseen behind the stored details (KOE-1700).
  it.each([
    ['Esc', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    [
      'a click outside it',
      () => {
        const backdrop = document.querySelector('.MuiBackdrop-root')
        if (backdrop) fireEvent.click(backdrop)
      },
    ],
  ])('drops an unsaved change when closed with %s', async (_way, close) => {
    const onClose = vi.fn()
    const { user } = await renderDialog(editable, 'fi', onClose)
    await flushPromises()
    await user.type(screen.getByLabelText('event.description (locale.fi)'), 'Muutos')
    await flushPromises()
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()

    close()
    await flushPromises()
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()

    await renderDialog(editable)
    await flushPromises()
    expect(screen.getByLabelText('event.description (locale.fi)')).toHaveValue(editable.description)
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  })

  // The dialog sits on the event view from the start, closed. What it saves against is the event as it
  // was when the dialog opened, not when the view did (KOE-1700).
  it('saves against the event as another save left it before the dialog opened', async () => {
    let store: TestStore | undefined
    const savedElsewhere = { ...editable, modifiedAt: new Date(editable.modifiedAt.getTime() + 60_000) }
    vi.mocked(putEvent).mockResolvedValueOnce(savedElsewhere)
    const Toggled = () => {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            details
          </button>
          <EventDetailsDialog eventId={editable.id} onClose={() => setOpen(false)} open={open} />
        </>
      )
    }
    const { user } = await renderAdminRoutes({
      events: [editable],
      initialEntry: Path.admin.viewEvent(editable.id),
      initializeState: (initial) => {
        store = initial
        // The view selects its event, so a save sends only what changed.
        initial.set(adminEventIdAtom, editable.id)
      },
      routes: [{ element: <Toggled />, path: Path.admin.viewEvent() }],
    })
    await flushPromises()
    // The form loads its options when the dialog first opens; an awaited act lets that suspense finish.
    const openDetails = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'details' }))
      })
      await flushPromises()
    }

    await openDetails()
    await user.click(screen.getByRole('button', { name: 'cancel' }))
    await flushPromises()
    // Another secretary's save, as the socket brings it.
    await act(async () => store?.set(adminEventAtom(editable.id), savedElsewhere))
    await openDetails()
    await user.type(screen.getByLabelText('event.description (locale.fi)'), 'Muutos')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({ modifiedAt: savedElsewhere.modifiedAt }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
  })
})
