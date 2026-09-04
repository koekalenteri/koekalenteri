import type { ReactNode } from 'react'
import type { Registration, RegistrationClass } from '../../../types'
import { screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { GROUP_KEY_RESERVE } from '../../../lib/registration'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../../test-utils/utils'
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
    const { container } = await renderSuspended(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="AVO" />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with cancelled registration(s)', async () => {
    const registrations: Registration[] = [registrationWithStaticDates, registrationWithStaticDatesCancelled].map(
      (r) => ({ ...r, setGroup: vi.fn() })
    )

    const { container } = await renderSuspended(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="ALO" registrations={registrations} />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('lists every class in one reserve list when it covers the whole trial', async () => {
    // The WT tab has no class of its own (KOE-912): one reserve list for the trial, each row naming
    // the class the dog is waiting for a place in.
    const reserve = (id: string, eventClass: RegistrationClass, regNo: string): Registration => ({
      ...registrationWithStaticDates,
      class: eventClass,
      dates: [{ date: eventWithStaticDatesAnd3Classes.startDate, time: 'kp' }],
      dog: { ...registrationWithStaticDates.dog, regNo },
      group: { key: GROUP_KEY_RESERVE, number: eventClass === 'ALO' ? 1 : 2 },
      id,
    })

    await renderSuspended(
      <ClassEntrySelection
        event={eventWithStaticDatesAnd3Classes}
        registrations={[reserve('r-alo', 'ALO', 'ALO-1'), reserve('r-voi', 'VOI', 'VOI-1')]}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    // Translations are not loaded in this suite, so the keys stand in for the Finnish labels.
    expect(screen.getByRole('heading', { level: 6, name: /Osallistujat/ }).textContent).toContain(
      'eventManagement.allClasses'
    )
    expect(screen.getByText('ALO-1')).toBeInTheDocument()
    expect(screen.getByText('VOI-1')).toBeInTheDocument()
    expect(screen.getAllByRole('columnheader', { name: 'startListExport.class' }).length).toBeGreaterThan(0)
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

    const { container } = await renderSuspended(
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

    const { container } = await renderSuspended(
      <ClassEntrySelection event={eventWithStaticDatesAnd3Classes} eventClass="VOI" registrations={registrations} />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(container.querySelector('[data-testid="WarningAmberOutlinedIcon"]')).not.toBeInTheDocument()
  })
})
