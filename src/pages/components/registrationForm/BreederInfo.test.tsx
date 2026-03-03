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
import { BreederInfo } from './BreederInfo'

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
describe('BreederInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => jest.useRealTimers())

  it('should render with minimal info', () => {
    const { container } = render(<BreederInfo reg={registrationWithStaticDates} />, { wrapper: Wrapper })
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = jest.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <BreederInfo reg={reg} onChange={onChange} />,
      { wrapper: Wrapper },
      {
        advanceTimers: jest.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const nameInput = screen.getByRole('textbox', { name: 'contact.name' })
    const locationInput = screen.getByRole('textbox', { name: 'contact.city' })

    await user.clear(nameInput)
    await user.clear(locationInput)

    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { location: '', name: '' } })
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.type(nameInput, 'test breeder')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { location: '', name: 'test breeder' } })
    expect(onChange).toHaveBeenCalledTimes(2)

    await user.type(locationInput, 'test city')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { location: 'test city', name: 'test breeder' } })
    expect(onChange).toHaveBeenCalledTimes(3)

    await flushPromises()
  })
})
