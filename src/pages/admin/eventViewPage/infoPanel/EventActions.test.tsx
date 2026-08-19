import type { UserEvent } from '@testing-library/user-event'
import type { Registration } from '../../../../types'
import { screen } from '@testing-library/react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from '../../../../__mockData__/events'
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
jest.mock('../../../../api/event')
jest.mock('../../../../api/user')
jest.mock('../../recoil/events/effects', () => ({
  adminRemoteEventsEffect: () => undefined,
}))

// Mock the notistack enqueueSnackbar
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

function _getGroupKey(r: Registration, i: number) {
  if (r.cancelled) return 'cancelled'
  if (i === 0) return 'reserve'
  return eventRegistrationDateKey(r.dates[0])
}

async function openInfoPanel(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: 'eventManagement.open' }))
}

describe('InfoPanel>', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.setItem('idToken', JSON.stringify(TEST_ID_TOKEN))
  })

  afterAll(() => localStorage.removeItem('idToken'))

  it('runs the moved create registration action', async () => {
    const onCreateRegistration = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={activeEventWithStaticDates} onCreateRegistration={onCreateRegistration} registrations={[]} />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    await user.click(screen.getByRole('button', { name: /createRegistration/i }))

    expect(onCreateRegistration).toHaveBeenCalledTimes(1)
  })

  it('runs the moved event details action', async () => {
    const onOpenDetails = jest.fn()
    const { user } = renderWithUserEvents(
      <InfoPanel event={eventWithStaticDates} onOpenDetails={onOpenDetails} registrations={[]} />,
      {
        wrapper: RecoilRoot,
      }
    )
    await openInfoPanel(user)

    await user.click(screen.getByRole('button', { name: 'eventManagement.showEventDetails' }))

    expect(onOpenDetails).toHaveBeenCalledTimes(1)
  })
})
