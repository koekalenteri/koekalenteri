import type { DogEvent, Patch } from '@/types'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { flushPromises } from '@/test-utils/utils'
import { renderEditPage } from './test-utils/editPageRoutes'

vi.mock('@/api/user')
vi.mock('@/api/event')
vi.mock('@/api/eventType')
vi.mock('@/api/judge')
vi.mock('@/api/location')
vi.mock('@/api/official')
vi.mock('@/api/organizer')
vi.mock('@/api/registration')

vi.mock('@/hooks/useWebSocketContext', () => ({
  useWebSocketContext: () => ({ subscribeEvent: vi.fn(), unsubscribeEvent: vi.fn(), viewers: [] }),
}))

/**
 * The form as one field. In jsdom, the router renders a blocked navigation as a transition, and that
 * render of the real EventForm suspends on adminUserOrganizersAtom through eventFormOptionsAtom and does
 * not finish, so the question never opens. The app shows it: the browser test "asks before leaving the
 * edit page with a change: staying keeps it, leaving drops it" in e2e/tests/secretary.spec.ts runs the
 * real form (KOE-1700).
 */
vi.mock('./components/EventForm', () => ({
  default: ({
    event,
    onChange,
  }: {
    readonly event: DogEvent
    readonly onChange?: (event: Patch<DogEvent>) => void
  }) => (
    <label>
      description
      <input value={event.description ?? ''} onChange={(e) => onChange?.({ ...event, description: e.target.value })} />
    </label>
  ),
}))

// Leaving the edit page with a change asks first, as the posts and teams pages do (KOE-1700).
describe('EventEditPage, left with an unsaved change', () => {
  const editable: DogEvent = { ...eventWithStaticDates, state: 'draft' }
  const EDIT_DRAFT_KEY = `adminEditableEvent/edit/Id__${editable.id}`
  const STATIONS_DRAFT_KEY = `adminEditableEvent/stations/Id__${editable.id}`
  const description = () => screen.getByLabelText('description')

  const openPage = async () => {
    const rendered = await renderEditPage(editable)
    await rendered.user.type(description(), 'Muutos')
    await flushPromises()
    return rendered
  }

  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('asks, and staying keeps the page and the change', async () => {
    const { user } = await openPage()

    await user.click(screen.getByRole('link', { name: 'menu' }))
    await user.click(await screen.findByRole('button', { name: 'unsavedChanges.stay' }))
    await flushPromises()

    expect(screen.queryByText('elsewhere')).not.toBeInTheDocument()
    expect(description()).toHaveValue(`${editable.description}Muutos`)
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).not.toBeNull()
  })

  it("asks, and leaving discards the page's draft, and only that", async () => {
    const stationsDraft = JSON.stringify({ ...editable, name: 'Rastien luonnos' })
    sessionStorage.setItem(STATIONS_DRAFT_KEY, stationsDraft)
    const { user } = await openPage()

    await user.click(screen.getByRole('link', { name: 'menu' }))
    await user.click(await screen.findByRole('button', { name: 'unsavedChanges.leave' }))
    await flushPromises()

    expect(screen.getByText('elsewhere')).toBeInTheDocument()
    expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull()
    expect(sessionStorage.getItem(STATIONS_DRAFT_KEY)).toBe(stationsDraft)
  })

  it('has the browser ask before the tab closes', async () => {
    await openPage()

    const unload = new Event('beforeunload', { cancelable: true })
    fireEvent(window, unload)

    expect(unload.defaultPrevented).toBe(true)
  })
})
