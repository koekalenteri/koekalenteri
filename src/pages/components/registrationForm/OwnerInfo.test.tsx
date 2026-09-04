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

  describe('co-owner contact details (KOE-1351)', () => {
    const withCoOwner = (): Registration => {
      const reg = clone<Registration>(registrationWithStaticDates)
      reg.ownerHandles = 'owner-1'
      reg.ownerPays = 'owner-1'
      reg.owners = [
        { ...reg.owner!, key: 'owner-1' },
        { email: '', key: 'owner-2', membership: false, name: 'Co Owner' },
      ]
      return reg
    }

    it('asks a co-owner who neither handles nor pays for a name only', () => {
      render(<OwnerInfo reg={withCoOwner()} orgId="test" />, { wrapper: Wrapper })

      expect(screen.getAllByRole('textbox', { name: 'contact.name' })).toHaveLength(2)
      expect(screen.getAllByRole('textbox', { name: 'contact.city' })).toHaveLength(1)
      expect(screen.getAllByRole('textbox', { name: 'contact.email' })).toHaveLength(1)
      expect(screen.getAllByRole('textbox', { name: 'contact.phone' })).toHaveLength(1)
    })

    it('lets a co-owner give contact details anyway', async () => {
      const { user } = renderWithUserEvents(
        <OwnerInfo reg={withCoOwner()} orgId="test" />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )

      await user.click(screen.getByRole('button', { name: 'registration.cta.addOwnerContact' }))
      await flushPromises()

      expect(screen.getAllByRole('textbox', { name: 'contact.email' })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'registration.cta.addOwnerContact' })).not.toBeInTheDocument()
    })

    it('keeps details already on file visible, so nothing is edited out of sight', () => {
      const reg = withCoOwner()
      reg.owners![1] = { ...reg.owners![1], phone: '+3584012399' }
      render(<OwnerInfo reg={reg} orgId="test" />, { wrapper: Wrapper })

      expect(screen.getAllByRole('textbox', { name: 'contact.phone' })).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'registration.cta.addOwnerContact' })).not.toBeInTheDocument()
    })

    it('asks the co-owner for everything once they are the one who handles', () => {
      const reg = withCoOwner()
      reg.ownerHandles = 'owner-2'
      render(<OwnerInfo reg={reg} orgId="test" />, { wrapper: Wrapper })

      expect(screen.getAllByRole('textbox', { name: 'contact.city' })).toHaveLength(2)
      expect(screen.getAllByRole('textbox', { name: 'contact.email' })).toHaveLength(2)
      expect(screen.getAllByRole('textbox', { name: 'contact.phone' })).toHaveLength(2)
    })
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
