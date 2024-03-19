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
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { name: '' } })

    await user.type(nameInput, 'test breeder')
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { name: 'test breeder' } })

    await user.type(locationInput, 'test city')
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { location: 'test city', name: 'test breeder' } })

    await flushPromises()
  })
})
