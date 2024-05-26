import type { ReactNode } from 'react'
import type { Registration } from '../../../types'

import { Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { clone } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import { PayerInfo } from './PayerInfo'

jest.mock('../../../api/dog')
jest.mock('../../../api/registration')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <RecoilRoot>
        <SnackbarProvider>
          <Suspense fallback={<div>loading...</div>}>{props.children}</Suspense>
        </SnackbarProvider>
      </RecoilRoot>
    </LocalizationProvider>
  )
}
describe('PayerInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<PayerInfo reg={{}} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = jest.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <PayerInfo reg={reg} onChange={onChange} />,
      { wrapper: Wrapper },
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox', { name: 'contact.name' })
    const emailInput = screen.getByRole('textbox', { name: 'contact.email' })
    const phoneInput = screen.getByRole('textbox', { name: 'contact.phone' })

    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith({ payer: { name: '' } })

    await user.type(input, 'test handler')
    expect(onChange).toHaveBeenLastCalledWith({ payer: { name: 'test handler' } })

    await user.type(emailInput, '\r\ntest@exmaple.com\r\n ')
    expect(onChange).toHaveBeenLastCalledWith({
      payer: { email: 'test@exmaple.com', name: 'test handler' },
    })

    await user.type(phoneInput, '40123456')
    expect(onChange).toHaveBeenLastCalledWith({
      payer: { email: 'test@exmaple.com', name: 'test handler', phone: '+358 40 123456' },
    })

    await flushPromises()
  })
})
