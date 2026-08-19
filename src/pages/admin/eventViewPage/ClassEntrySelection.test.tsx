import type { ReactNode } from 'react'
import type { Registration } from '../../../types'
import { render } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { eventWithStaticDatesAnd3Classes } from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesCancelled } from '../../../__mockData__/registrations'
import { flushPromises, TEST_ID_TOKEN } from '../../../test-utils/utils'
import { idTokenAtom } from '../../recoil'
import ClassEntrySelection from './ClassEntrySelection'

vi.mock('../../../api/event')
vi.mock('../../../api/registration')
vi.mock('../../../api/user')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
      <SnackbarProvider>
        <ConfirmProvider>
          <Suspense fallback={<>loading...</>}>{props.children}</Suspense>
        </ConfirmProvider>
      </SnackbarProvider>
    </RecoilRoot>
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
})
