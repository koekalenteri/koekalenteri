import type { Registration } from '../../../types'

import { screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { eventWithEntryClosed, eventWithStaticDates } from '../../../__mockData__/events'
import { registrationsToEventWithEntryClosed } from '../../../__mockData__/registrations'
import { eventRegistrationDateKey } from '../../../lib/event'
import { renderWithUserEvents } from '../../../test-utils/utils'

import InfoPanel from './InfoPanel'

// Mock the API calls
jest.mock('../../../api/event')

// Mock the notistack enqueueSnackbar
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

function getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return eventRegistrationDateKey(r.dates[0])
}

describe('InfoPanel>', () => {
  it('renders with no registrations', () => {
    const { container } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

    expect(container).toMatchSnapshot()
  })

  it('renders with event with closed entry and registrations', () => {
    const { container } = renderWithUserEvents(
      <InfoPanel event={eventWithEntryClosed} registrations={registrationsToEventWithEntryClosed} />,
      { wrapper: RecoilRoot }
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
            number: i,
            key: getGroupKey(r, i),
          },
        }))}
      />,
      { wrapper: RecoilRoot }
    )

    expect(container).toMatchSnapshot()
  })

  it('switches between tabs correctly', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

    // Initially, the first tab should be active and show "Osallistujat"
    expect(screen.getByText('Tapahtuman tilanne')).toBeInTheDocument()
    expect(screen.getByText('Osallistujat')).toBeInTheDocument()

    // Click on the second tab
    await user.click(screen.getByText('Tehtävälista'))

    // Now the second tab should be active and show "Liitteet"
    expect(screen.getByText('Liitteet')).toBeInTheDocument()
    expect(screen.getByText('Koekutsu')).toBeInTheDocument()

    // Click back on the first tab
    await user.click(screen.getByText('Tapahtuman tilanne'))

    // The first tab content should be visible again
    expect(screen.getByText('Osallistujat')).toBeInTheDocument()
  })

  it('expands and collapses correctly', async () => {
    const { user } = renderWithUserEvents(<InfoPanel event={eventWithStaticDates} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

    // Initially, the panel should be expanded
    expect(screen.getByText('Osallistujat')).toBeInTheDocument()

    // Click the collapse button (the KeyboardArrowUp icon)
    const collapseButton = screen.getByRole('button', { name: '' }) // The icon button doesn't have a name
    await user.click(collapseButton)

    // Now the content should be collapsed and "Osallistujat" should not be visible
    expect(screen.queryByText('Osallistujat')).not.toBeVisible()

    // Click the expand button again
    await user.click(collapseButton)

    // The content should be visible again
    expect(screen.getByText('Osallistujat')).toBeVisible()
  })

  it('disables message buttons when there are no participants', () => {
    // Create a test scenario with no participants in a class
    const emptyRegistrations: Registration[] = []

    const { container } = renderWithUserEvents(
      <InfoPanel event={eventWithEntryClosed} registrations={emptyRegistrations} />,
      {
        wrapper: RecoilRoot,
      }
    )

    // All message buttons should be disabled
    const buttons = screen.getAllByRole('button').filter((button) => button.textContent?.includes('LÄHETÄ'))

    buttons.forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('disables message buttons when participants are not confirmed', () => {
    // Create a test scenario with participants that are not confirmed
    const unconfirmedRegistrations = registrationsToEventWithEntryClosed.map((r) => ({
      ...r,
      confirmed: false,
    }))

    renderWithUserEvents(<InfoPanel event={eventWithEntryClosed} registrations={unconfirmedRegistrations} />, {
      wrapper: RecoilRoot,
    })

    // The message buttons for participants should be disabled
    const participantButtons = screen.getAllByText(/LÄHETÄ.*KOEKUTSU|LÄHETÄ.*KOEPAIKKAILMOITUS/i)

    participantButtons.forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('renders with event that has an invitation attachment', async () => {
    // Create a test event with an invitation attachment
    const eventWithAttachment = {
      ...eventWithStaticDates,
      invitationAttachment: 'test-attachment-key',
    }

    const { user } = renderWithUserEvents(<InfoPanel event={eventWithAttachment} registrations={[]} />, {
      wrapper: RecoilRoot,
    })

    // Switch to the second tab to see the attachment section
    await user.click(screen.getByText('Tehtävälista'))

    // It should show a link to the attachment
    expect(screen.getByText('Kutsu.pdf')).toBeInTheDocument()
    expect(screen.queryByText('Ei liitettyä tiedostoa')).not.toBeInTheDocument()
  })
})
