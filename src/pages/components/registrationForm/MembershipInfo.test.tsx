import type { ReactNode } from 'react'
import type { Registration } from '../../../types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { clone } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import MembershipInfo from './MembershipInfo'

vi.mock('../../../api/dog')
vi.mock('../../../api/registration')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <Provider>
        <SnackbarProvider>
          <Suspense fallback={<div>loading...</div>}>{props.children}</Suspense>
        </SnackbarProvider>
      </Provider>
    </LocalizationProvider>
  )
}
describe('MembershipInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<MembershipInfo reg={{}} orgId={'test'} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should render when owner handles and is member', () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = true
    // biome-ignore lint/style/noNonNullAssertion: its a test
    reg.owner!.membership = true

    const { container } = render(<MembershipInfo reg={reg} orgId={'test'} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = false
    // biome-ignore lint/style/noNonNullAssertion: its a test
    reg.owner!.membership = false
    // biome-ignore lint/style/noNonNullAssertion: its a test
    reg.handler!.membership = false

    const onChange = vi.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <MembershipInfo reg={reg} orgId={'test'} onChange={onChange} />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const ownerCheckbox = screen.getByRole('checkbox', { name: 'registration.ownerIsMember' })
    const hadnlerCheckbox = screen.getByRole('checkbox', { name: 'registration.handlerIsMember' })

    await user.click(ownerCheckbox)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      owner: {
        ...reg.owner,
        membership: true,
      },
    })

    await user.click(hadnlerCheckbox)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: {
        ...reg.handler,
        membership: true,
      },
    })

    await flushPromises()
  })
})
