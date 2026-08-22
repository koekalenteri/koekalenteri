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
import { PayerInfo } from './PayerInfo'

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
describe('PayerInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<PayerInfo reg={{}} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = vi.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <PayerInfo reg={reg} onChange={onChange} />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox', { name: 'contact.name' })
    const emailInput = screen.getByRole('textbox', { name: 'contact.email' })
    const phoneInput = screen.getByRole('textbox', { name: 'contact.phone' })

    await user.clear(input)
    await user.clear(emailInput)
    await user.clear(phoneInput)
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ payer: { email: '', name: '', phone: '' } })
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.type(input, 'test handler')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ payer: { email: '', name: 'test handler', phone: '' } })
    expect(onChange).toHaveBeenCalledTimes(2)

    await user.type(emailInput, '\r\ntest@exmaple.com\r\n ')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      payer: { email: 'test@exmaple.com', name: 'test handler', phone: '' },
    })
    expect(onChange).toHaveBeenCalledTimes(3)

    await user.type(phoneInput, '40123456')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({
      payer: { email: 'test@exmaple.com', name: 'test handler', phone: '+358 40 123456' },
    })
    expect(onChange).toHaveBeenCalledTimes(4)

    await flushPromises()
  })
})
