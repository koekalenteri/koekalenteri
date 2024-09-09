import type { ReactNode } from 'react'
import type { Registration } from '../../../types'

import { Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { clone } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import { OwnerInfo } from './OwnerInfo'

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
describe('OwnerInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<OwnerInfo reg={{}} orgId="test" />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = jest.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <OwnerInfo reg={reg} onChange={onChange} orgId="test" />,
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
    // const memberCheckbox = screen.getByRole('checkbox', { name: 'registration.ownerIsMember' })
    const handlerCheckbox = screen.getByRole('checkbox', { name: 'registration.ownerHandles' })
    const payerCheckbox = screen.getByRole('checkbox', { name: 'registration.ownerPays' })

    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith({
      owner: { membership: false, name: '' },
      ownerHandles: true,
      ownerPays: true,
    })
    onChange.mockClear()

    await user.type(input, 'test handler')
    expect(onChange).toHaveBeenLastCalledWith({
      owner: { membership: false, name: 'test handler' },
      ownerHandles: true,
      ownerPays: true,
    })
    onChange.mockClear()

    await user.type(locationInput, 'test city')
    expect(onChange).toHaveBeenLastCalledWith({
      owner: { location: 'test city', membership: false, name: 'test handler' },
      ownerHandles: true,
      ownerPays: true,
    })
    onChange.mockClear()

    await user.type(emailInput, 'test@exmaple.com \n')
    expect(onChange).toHaveBeenLastCalledWith({
      owner: { email: 'test@exmaple.com', location: 'test city', membership: false, name: 'test handler' },
      ownerHandles: true,
      ownerPays: true,
    })
    onChange.mockClear()

    await user.type(phoneInput, '40123456')
    expect(onChange).toHaveBeenLastCalledWith({
      owner: {
        email: 'test@exmaple.com',
        location: 'test city',
        membership: false,
        name: 'test handler',
        phone: '+358 40 123456',
      },
      ownerHandles: true,
      ownerPays: true,
    })
    onChange.mockClear()

    /*
    await user.click(memberCheckbox)
    expect(onChange).toHaveBeenLastCalledWith({
      owner: {
        email: 'test@exmaple.com',
        location: 'test city',
        membership: true,
        name: 'test handler',
        phone: '+358 40 123456',
      },
      ownerHandles: true,
      ownerPays: true,
    })
    onChange.mockClear()
    */

    await user.click(handlerCheckbox)
    expect(onChange).toHaveBeenLastCalledWith({
      owner: {
        email: 'test@exmaple.com',
        location: 'test city',
        membership: false,
        name: 'test handler',
        phone: '+358 40 123456',
      },
      ownerHandles: false,
      ownerPays: true,
    })
    onChange.mockClear()

    await user.click(payerCheckbox)
    expect(onChange).toHaveBeenLastCalledWith({
      owner: {
        email: 'test@exmaple.com',
        location: 'test city',
        membership: false,
        name: 'test handler',
        phone: '+358 40 123456',
      },
      ownerHandles: false,
      ownerPays: false,
    })
    onChange.mockClear()

    await flushPromises()
  })

  it('should not call onChange when dog is not selected', async () => {
    const reg = {} // no registration number
    const onChange = jest.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <OwnerInfo reg={reg} onChange={onChange} orgId="test" />,
      { wrapper: Wrapper },
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const input = screen.getByRole('textbox', { name: 'contact.name' })

    await user.type(input, 'test handler')
    expect(onChange).not.toHaveBeenCalled()
  })
})
