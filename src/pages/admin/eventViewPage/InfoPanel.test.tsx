import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { AuditRecord, Registration } from '../../../types'
import { screen, waitFor } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithEntryClosed, eventWithStaticDates, eventWithStaticDatesAndClass } from '../../../__mockData__/events'
import { registrationsToEventWithEntryClosed } from '../../../__mockData__/registrations'
import { getEventAuditTrail } from '../../../api/event'
import { eventRegistrationDateKey } from '../../../lib/event'
import { renderWithUserEvents, TEST_ID_TOKEN } from '../../../test-utils/utils'
import { idTokenAtom } from '../../state'
import InfoPanel from './InfoPanel'

const activeEventWithStaticDates = {
  ...eventWithStaticDates,
  endDate: new Date('2099-12-31'),
}
vi.mock('../../../api/event')

function getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return eventRegistrationDateKey(r.dates[0])
}

async function openInfoPanel(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
}

describe('InfoPanel>', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getEventAuditTrail).mockResolvedValue([])
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })

  afterAll(() => localStorage.removeItem('idToken'))

  it('renders with no registrations', () => {
    const { container } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: ({ children }) => (
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>{children}</Provider>
      ),
    })

    const openButton = screen.getByRole('button', { name: 'eventManagement.open' })
    expect(openButton).toHaveStyle({ flexDirection: 'row' })
    expect(screen.getByTestId('MenuOpenIcon')).toBeInTheDocument()
    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations', () => {
    const { container } = renderWithUserEvents(
      <InfoPanel event={eventWithEntryClosed} registrations={registrationsToEventWithEntryClosed} />,
      { wrapper: Provider }
    )

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations with groups', () => {
    const { container } = renderWithUserEvents(
      <InfoPanel
        event={eventWithEntryClosed}
        registrations={registrationsToEventWithEntryClosed.map((r, i) => ({
          ...r,
          group: {
            ...r.dates[0],
            key: getGroupKey(r, i),
            number: i,
          },
        }))}
      />,
      { wrapper: Provider }
    )

    expect(container).toMatchSnapshot()
  })

  it('shows status and task sections when opened', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    expect(screen.getByRole('tab', { name: 'eventManagement.tabs.management' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('eventManagement.actions')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.participantSelection.title')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.invitation.delivery')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.startList.publishing')).toBeInTheDocument()
    expect(screen.getByText('eventManagement.participantSelection.reserve')).toBeInTheDocument()
    const reserveRow = screen.getByText('eventManagement.participantSelection.reserve').closest('tr')
    if (!reserveRow) throw new Error('reserve row not found')
    const participantRow = reserveRow.previousElementSibling
    if (!(participantRow instanceof HTMLTableRowElement)) throw new Error('participant row not found')
    expect(participantRow).toHaveTextContent('NOU')
    expect((reserveRow.lastElementChild as HTMLTableCellElement).cellIndex).toBe(
      (participantRow.lastElementChild as HTMLTableCellElement).cellIndex
    )
    expect(screen.queryByText('Valmistelu')).not.toBeInTheDocument()
    expect(screen.getByText('Kokeen tiedot')).toBeInTheDocument()
    expect(screen.queryByText('Koko koe')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.attachment.addPdf' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.attachment.addPdf' }).closest('td')).toHaveClass(
      'MuiTableCell-alignRight'
    )
    expect(screen.getByText('eventManagement.invitation.canSendAfterPicked')).toBeInTheDocument()
    expect(screen.getByTestId('info-panel-content')).toHaveStyle({
      gridAutoRows: 'max-content',
      overflowY: 'auto',
    })
  })

  it('shows the audit trail on its own tab', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    await user.click(screen.getByRole('tab', { name: 'eventManagement.tabs.auditTrail' }))

    expect(screen.getByRole('tab', { name: 'eventManagement.tabs.auditTrail' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    expect(screen.getByText('eventManagement.participantSelection.title')).not.toBeVisible()
  })

  it('shows a loading indicator while the audit trail is loading', async () => {
    let resolveAuditTrail: ((value: AuditRecord[] | undefined) => void) | undefined
    vi.mocked(getEventAuditTrail).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAuditTrail = resolve
        })
    )
    const { user } = renderWithUserEvents(<InfoPanel event={activeEventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })

    await openInfoPanel(user)
    await user.click(screen.getByRole('tab', { name: 'eventManagement.tabs.auditTrail' }))

    expect(screen.getByRole('progressbar')).toBeVisible()

    resolveAuditTrail?.([])

    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument())
  })

  it('links to the authenticated unpublished start list preview when the start list is unavailable', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })
    await openInfoPanel(user)

    const publicStartListLink = screen.getByRole('link', { name: 'eventManagement.startList.previewUnpublished' })
    expect(publicStartListLink).toHaveAttribute('href', `/admin/event/startlist-preview/${eventWithStaticDates.id}`)
    expect(
      screen.getByText('eventManagement.startList.publishing').compareDocumentPosition(publicStartListLink) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('shows the Kennel Club ID for official events', async () => {
    const { user } = renderWithUserEvents(
      <InfoPanel event={{ ...eventWithStaticDatesAndClass, kcId: 12345 }} registrations={[]} />,
      { wrapper: Provider }
    )
    await openInfoPanel(user)

    expect(screen.getByText('Kokeen tiedot')).toBeInTheDocument()
    expect(screen.getByText('Koetunnus')).toBeInTheDocument()
    expect(screen.getByText('12345')).toBeInTheDocument()
  })

  it('expands and collapses correctly', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: Provider,
    })

    // Initially, only the drawer handle should be visible
    expect(screen.getByRole('button', { name: 'eventManagement.open' })).toBeInTheDocument()
    expect(screen.queryByText('eventManagement.participantSelection.title')).not.toBeInTheDocument()

    await openInfoPanel(user)

    // The opened drawer should show the panel contents
    expect(screen.getByText('eventManagement.participantSelection.title')).toBeInTheDocument()

    const collapseButton = screen.getByRole('button', { name: 'eventManagement.close' })
    await user.click(collapseButton)

    // The drawer should collapse back to the handle
    expect(screen.queryByText('eventManagement.participantSelection.title')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'eventManagement.open' })).toBeInTheDocument()
  })
})
