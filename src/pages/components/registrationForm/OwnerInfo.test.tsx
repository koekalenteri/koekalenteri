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
import { OwnerInfo } from './OwnerInfo'

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
describe('OwnerInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<OwnerInfo reg={{}} orgId="test" />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    reg.ownerHandles = undefined
    reg.ownerPays = undefined
    const onChange = vi.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <OwnerInfo reg={reg} onChange={onChange} orgId="test" />,
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

    const expectOwnerChange = (owner: Record<string, unknown>) => {
      const expected = expect.objectContaining(owner)
      expect(onChange).toHaveBeenLastCalledWith({ owner: expected, owners: [expected] })
    }

    await user.clear(input)
    await flushPromises()

    expectOwnerChange({
      email: 'owner@example.com',
      location: 'Owner Location',
      membership: false,
      name: '',
      phone: '+3584012345',
    })
    onChange.mockClear()

    await user.type(input, 'test owner')
    await flushPromises()

    expectOwnerChange({
      email: 'owner@example.com',
      location: 'Owner Location',
      membership: false,
      name: 'test owner',
      phone: '+3584012345',
    })
    onChange.mockClear()

    await user.clear(locationInput)
    await user.type(locationInput, 'test city')
    await flushPromises()

    expectOwnerChange({
      email: 'owner@example.com',
      location: 'test city',
      membership: false,
      name: 'test owner',
      phone: '+3584012345',
    })
    onChange.mockClear()

    await user.clear(emailInput)
    await user.type(emailInput, 'test@exmaple.com \n')
    await flushPromises()

    expectOwnerChange({
      email: 'test@exmaple.com',
      location: 'test city',
      membership: false,
      name: 'test owner',
      phone: '+3584012345',
    })
    onChange.mockClear()

    await user.clear(phoneInput)
    await user.type(phoneInput, '40123456')
    await flushPromises()

    expectOwnerChange({
      email: 'test@exmaple.com',
      location: 'test city',
      membership: false,
      name: 'test owner',
      phone: '+358 40 123456',
    })
    onChange.mockClear()

    await user.click(screen.getByText('registration.ownerIsMember'))
    await flushPromises()

    expectOwnerChange({ membership: true })
    onChange.mockClear()

    const handlesSomeoneElse = screen.getAllByRole('radio', { name: 'registration.someoneElse' })[0]
    const paysSomeoneElse = screen.getAllByRole('radio', { name: 'registration.someoneElse' })[1]

    await user.click(handlesSomeoneElse)
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({ ownerHandles: false })
    onChange.mockClear()

    await user.click(paysSomeoneElse)
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith({ ownerPays: false })
    onChange.mockClear()

    await flushPromises()
  })

  it('should not call onChange when dog is not selected', async () => {
    const reg = {} // no registration number
    const onChange = vi.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <OwnerInfo reg={reg} onChange={onChange} orgId="test" />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox', { name: 'contact.name' })

    await user.type(input, 'test handler')
    expect(onChange).not.toHaveBeenCalled()
  })
})
