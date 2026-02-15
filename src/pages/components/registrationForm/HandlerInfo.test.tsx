import type { ReactNode } from 'react'
import type { Registration } from '../../../types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { RecoilRoot } from 'recoil'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { clone } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import { HandlerInfo } from './HandlerInfo'

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
describe('HadnlerInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<HandlerInfo reg={{}} orgId="test" />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = jest.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <HandlerInfo reg={reg} onChange={onChange} orgId="test" />,
      { wrapper: Wrapper },
      {
        advanceTimers: jest.advanceTimersByTime,
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
})
