import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Registration } from '../../../../types'
import { screen, within } from '@testing-library/react'
import { Provider } from 'jotai'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../../../__mockData__/events'
import { eventWithStations, registrationsToEventWithStations } from '../../../../__mockData__/resultsEvent'
import { eventRegistrationDateKey } from '../../../../lib/event'
import { renderWithUserEvents, TEST_ID_TOKEN } from '../../../../test-utils/utils'
import InfoPanel from '../InfoPanel'

const activeEventWithStaticDates = {
  ...eventWithStaticDates,
  endDate: new Date('2099-12-31'),
}
const _activeEventWithStaticDatesAndClass = {
  ...eventWithStaticDatesAndClass,
  endDate: new Date('2099-12-31'),
}

// Mock the API calls
vi.mock('../../../../api/event')
vi.mock('../../../../api/user')

// Mock the notistack enqueueSnackbar
vi.mock('notistack', () => ({
  enqueueSnackbar: vi.fn(),
}))

function _getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return eventRegistrationDateKey(r.dates[0])
}

async function openInfoPanel(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
}

/** A panel section, found by the heading that names it — where each control lives is the point here. */
function sectionOf(headingKey: string): HTMLElement {
  const section = screen.getByText(headingKey).parentElement
  if (!section) throw new Error(`no section for ${headingKey}`)
  return section
}

describe('InfoPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })

  afterAll(() => localStorage.removeItem('idToken'))

  it('runs the moved create registration action', async () => {
    const onCreateRegistration = vi.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={activeEventWithStaticDates} onCreateRegistration={onCreateRegistration} registrations={[]} />,
      {
        wrapper: Provider,
      }
    )
    await openInfoPanel(user)

    await user.click(screen.getByRole('button', { name: /createRegistration/i }))

    expect(onCreateRegistration).toHaveBeenCalledTimes(1)
  })

  it('runs the moved event details action', async () => {
    const onOpenDetails = vi.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithStaticDates} onOpenDetails={onOpenDetails} registrations={[]} />,
      {
        wrapper: Provider,
      }
    )
    await openInfoPanel(user)

    await user.click(screen.getByRole('button', { name: 'eventManagement.showEventDetails' }))

    expect(onOpenDetails).toHaveBeenCalledTimes(1)
  })

  it('keeps scoring with the results, not among the general actions (KOE-1354)', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithStations} registrations={registrationsToEventWithStations} />,
      { wrapper: Provider }
    )
    await openInfoPanel(user)

    const resultsSection = sectionOf('eventManagement.results.title')
    const actionsSection = sectionOf('eventManagement.actions')

    // Defining the posts and entering the scores are the steps that feed the publish buttons above
    // them, the way the draw entry feeds the start numbers (KOE-1297).
    expect(within(resultsSection).getByRole('link', { name: 'eventManagement.stations' })).toBeInTheDocument()
    expect(within(resultsSection).getByRole('link', { name: 'eventManagement.enterResults' })).toBeInTheDocument()
    expect(within(actionsSection).queryByRole('link', { name: 'eventManagement.stations' })).not.toBeInTheDocument()
    expect(within(actionsSection).queryByRole('link', { name: 'eventManagement.enterResults' })).not.toBeInTheDocument()

    // What is genuinely general stays where it was.
    expect(within(actionsSection).getByRole('button', { name: 'eventManagement.showEventDetails' })).toBeInTheDocument()
    expect(
      within(actionsSection).getByRole('link', { name: 'eventManagement.startList.secretary' })
    ).toBeInTheDocument()
  })

  it('sends a message to a chosen group of recipients (KOE-1073)', async () => {
    const onSendMessage = vi.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel
        event={eventWithStations}
        onSendMessage={onSendMessage}
        registrations={registrationsToEventWithStations}
      />,
      { wrapper: Provider }
    )
    await openInfoPanel(user)

    const actionsSection = sectionOf('eventManagement.actions')
    await user.click(within(actionsSection).getByRole('button', { name: 'eventManagement.message.action' }))

    expect(onSendMessage).toHaveBeenCalledTimes(1)
  })

  it('has nobody to message before anyone has entered', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    expect(screen.getByRole('button', { name: 'eventManagement.message.action' })).toBeDisabled()
  })
})
