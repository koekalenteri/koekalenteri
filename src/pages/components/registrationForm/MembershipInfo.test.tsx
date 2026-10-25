import type { ReactNode } from 'react'
import type { Registration } from '@/types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { createStore, Provider } from 'jotai'
import { Suspense } from 'react'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { locales } from '@/i18n'
import { clone } from '@/lib/utils'
import { dogCacheAtom } from '@/pages/state/dog'
import { flushPromises, renderWithUserEvents, runPendingTimers } from '@/test-utils/utils'
import AppSnackbarProvider from '../AppSnackbarProvider'
import MembershipInfo from './MembershipInfo'

vi.mock('@/api/dog')
vi.mock('@/api/registration')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <Provider>
        <AppSnackbarProvider>
          <Suspense fallback={<div>loading...</div>}>{props.children}</Suspense>
        </AppSnackbarProvider>
      </Provider>
    </LocalizationProvider>
  )
}
describe('MembershipInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal info', () => {
    render(<MembershipInfo reg={{}} orgId={'test'} />, { wrapper: Wrapper })
    expect(screen.getByText('validation.registration.choose field')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('should render only the owner checkbox when owner handles', () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = true
    reg.owner!.membership = true

    render(<MembershipInfo reg={reg} orgId={'test'} />, { wrapper: Wrapper })
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
  })

  it('should render only the owner checkbox when the selection is unset (KOE-1598)', () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    delete reg.ownerHandles

    render(<MembershipInfo reg={reg} orgId={'test'} />, { wrapper: Wrapper })
    expect(screen.getAllByRole('checkbox')).toHaveLength(1)
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

  // The membership checkbox writes the membership, not what the dog cache remembers of the handler:
  // on a picked entry the handler's details are locked and a filled-in field is refused (KOE-1588).
  it("writes only the handler's membership, whatever the dog cache remembers of them", async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = false
    reg.handler = { email: 'handler@example.com', membership: false, name: 'Handler Name' }
    const store = createStore()
    store.set(dogCacheAtom, {
      [reg.dog.regNo]: {
        handler: { email: '', location: 'Cached Town', membership: {}, name: 'Cached Name', phone: '+358401111111' },
      },
    })
    const onChange = vi.fn()
    const { user } = renderWithUserEvents(
      <Provider store={store}>
        <MembershipInfo reg={reg} orgId={'test'} onChange={onChange} />
      </Provider>,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()

    const [, handlerCheckbox] = screen.getAllByRole('checkbox')
    await user.click(handlerCheckbox)
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({ handler: { ...reg.handler, membership: true } })
    await runPendingTimers()
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
