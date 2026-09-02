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

  it('should render only the owner checkbox when owner handles', () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = true
    reg.owner!.membership = true

    const { container } = render(<MembershipInfo reg={reg} orgId={'test'} />, { wrapper: Wrapper })
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
    expect(container).toMatchSnapshot()
  })

  it('should call onChange for a separate handler', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = false
    reg.owner!.membership = false
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

    // The owner's checkbox comes first, the separate handler's after it
    const [, handlerCheckbox] = screen.getAllByRole('checkbox')

    await user.click(handlerCheckbox)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: {
        ...reg.handler,
        membership: true,
      },
    })

    await flushPromises()
  })

  it('should call onChange for an owner', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = true
    reg.owner!.membership = false

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

    await user.click(screen.getByRole('checkbox'))
    await flushPromises()

    const expected = expect.objectContaining({ membership: true, name: 'Owner Name' })
    expect(onChange).toHaveBeenLastCalledWith({ owner: expected, owners: [expected] })

    await flushPromises()
  })
})
