import type { ReactNode } from 'react'
import type { Registration } from '@/types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { locales } from '@/i18n'
import { clone } from '@/lib/utils'
import { flushPromises, renderWithUserEvents } from '@/test-utils/utils'
import AppSnackbarProvider from '../AppSnackbarProvider'
import { HandlerInfo } from './HandlerInfo'

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
describe('HadnlerInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    localStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('should render with minimal info', () => {
    render(<HandlerInfo reg={{}} orgId="test" />, { wrapper: Wrapper })

    expect(screen.getByRole('textbox', { name: 'contact.name' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'contact.city' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'contact.email' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'contact.phone' })).toHaveValue('')
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = vi.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <HandlerInfo reg={reg} onChange={onChange} orgId="test" />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox', { name: 'contact.name' })
    const locationInput = screen.getByRole('textbox', { name: 'contact.city' })
    const emailInput = screen.getByRole('textbox', { name: 'contact.email' })
    const phoneInput = screen.getByRole('textbox', { name: 'contact.phone' })

    await user.clear(input)
    await user.clear(locationInput)
    await user.clear(emailInput)
    await user.clear(phoneInput)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: { email: '', location: '', membership: false, name: '', phone: '' },
    })

    await user.type(input, 'test handler')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: { email: '', location: '', membership: false, name: 'test handler', phone: '' },
    })

    await user.type(locationInput, 'test city')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: { email: '', location: 'test city', membership: false, name: 'test handler', phone: '' },
    })

    await user.type(emailInput, ' test@exmaple.com \n')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: { email: 'test@exmaple.com', location: 'test city', membership: false, name: 'test handler', phone: '' },
    })

    await user.type(phoneInput, '40123456')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      handler: {
        email: 'test@exmaple.com',
        location: 'test city',
        membership: false,
        name: 'test handler',
        phone: '+358 40 123456',
      },
    })

    await flushPromises()
  })

  // KOE-1598: an unset selection is the owner handling, so the cached handler membership is not
  // written over the stored handler; a separate handler still takes it.
  it.each([
    ['an unset selection', 0, undefined],
    ['a separate handler', 1, false],
  ])('with %s writes the cached membership %i time(s)', async (_case, calls, ownerHandles) => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = ownerHandles
    reg.handler = { email: 'handler@example.com', location: '', membership: false, name: 'Handler', phone: '' }
    localStorage.setItem('dog-cache', JSON.stringify({ [reg.dog.regNo]: { handler: { membership: { test: true } } } }))
    const onChange = vi.fn()

    render(<HandlerInfo reg={reg} onChange={onChange} orgId="test" />, { wrapper: Wrapper })
    await flushPromises()

    expect(onChange).toHaveBeenCalledTimes(calls)
  })
})
