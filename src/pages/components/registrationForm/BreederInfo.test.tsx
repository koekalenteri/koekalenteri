import type { ReactNode } from 'react'
import type { Registration } from '../../../types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { clone } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'
import { BreederInfo } from './BreederInfo'

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
describe('BreederInfo', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should call onChange', async () => {
    const reg = clone<Registration>(registrationWithStaticDates)
    const onChange = vi.fn((props) => Object.assign(reg, props))
    const { user } = renderWithUserEvents(
      <BreederInfo reg={reg} onChange={onChange} />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await flushPromises()
    expect(onChange).not.toHaveBeenCalled()

    const nameInput = screen.getByRole('textbox', { name: 'contact.name' })

    await user.clear(nameInput)

    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { name: '' } })
    expect(onChange).toHaveBeenCalledTimes(1)

    await user.type(nameInput, 'test breeder')
    await flushPromises()
    expect(onChange).toHaveBeenLastCalledWith({ breeder: { name: 'test breeder' } })
    expect(onChange).toHaveBeenCalledTimes(2)

    await flushPromises()
  })
})
