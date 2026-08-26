import type { ReactNode } from 'react'
import type { Registration } from '../../../types'
import { render } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { flushPromises, TEST_ID_TOKEN } from '../../../test-utils/utils'
import { idTokenAtom } from '../../state'
import ClassEntrySelection from './ClassEntrySelection'

vi.mock('../../../api/event')
vi.mock('../../../api/registration')
vi.mock('../../../api/user')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
      <SnackbarProvider>
        <ConfirmProvider>
          <Suspense fallback={<>loading...</>}>{props.children}</Suspense>
        </ConfirmProvider>
      </SnackbarProvider>
    </Provider>
  )
}

describe('ClassEntrySelection', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    const { container } = render(<ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="AVO" />, {
      wrapper: Wrapper,
    })
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with cancelled registration(s)', async () => {
    const registrations: Registration[] = [registrationWithStaticDates, registrationWithStaticDatesCancelled].map(
      (r) => ({ ...r, setGroup: vi.fn() })
    )

    const { container } = render(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="ALO" registrations={registrations} />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('shows a warning icon for a registration whose dates are not on the class days', async () => {
    // VOI runs on the event's end date; the registration picks the start date instead
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        class: 'VOI',
        dates: [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'kp' }],
      },
    ]

    const { container } = render(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="VOI" registrations={registrations} />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(container.querySelector('[data-testid="WarningAmberOutlinedIcon"]')).toBeInTheDocument()
  })

  it('does not show a warning icon when the dates are on the class days', async () => {
    const registrations: Registration[] = [
      {
        ...registrationWithStaticDates,
        class: 'VOI',
        dates: [{ date: eventWithStaticDatesAnd3Classes.endDate, time: 'kp' }],
      },
    ]

    const { container } = render(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="VOI" registrations={registrations} />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(container.querySelector('[data-testid="WarningAmberOutlinedIcon"]')).not.toBeInTheDocument()
  })
})
