import { ReactNode, Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationDogAged20MonthsAndNoResults } from '../../../__mockData__/dogs'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { renderWithUserEvents, waitForDebounce } from '../../../test-utils/utils'
import { merge } from '../../../utils'

import { DogInfo } from './DogInfo'

const eventDate = registrationWithStaticDates.dates[0].date

jest.mock('../../../api/dog')
jest.mock('../../../api/registration')

function Wrapper(props: { children?: ReactNode }) {
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

describe('DogInfo', () => {
  it('should render', async () => {
    const { container } = render(
      <DogInfo reg={registrationWithStaticDates} eventDate={eventDate} minDogAgeMonths={0} />,
      { wrapper: Wrapper }
    )
    await waitForDebounce()

    expect(container).toMatchSnapshot()
  })

  it('Should allow changing dog', async () => {
    const reg = merge(registrationWithStaticDates, {})
    const changeHandler = jest.fn((props) => Object.assign(reg, props))
    const newDog = registrationDogAged20MonthsAndNoResults

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} />,
      { wrapper: Wrapper }
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    expect(input).toHaveValue('TESTDOG-0010')

    await user.clear(input)
    expect(input).toHaveValue('')
    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dog: expect.objectContaining({ regNo: '' }),
        owner: undefined,
        handler: undefined,
        ownerHandles: true,
        results: [],
      }),
      true
    )

    await user.type(input, newDog.regNo)
    expect(input).toHaveValue(newDog.regNo)

    const button = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(button)

    expect(changeHandler).toHaveBeenLastCalledWith(expect.objectContaining({ dog: newDog }), true)
  })

  it('should automatically fetch when selecting from cached dogs', async () => {
    const reg = {}
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'dog-cache') {
        return JSON.stringify({ 'TESTDOG-0020': {} })
      }
      return null
    })

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} />,
      { wrapper: Wrapper }
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    expect(input).toHaveValue('')
    await user.type(input, 't{ArrowDown}{Enter}')
    expect(input).toHaveValue('TESTDOG-0020')
    await waitForDebounce()
    await waitForDebounce()

    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: registrationDogAged20MonthsAndNoResults }),
      true
    )
  })
})
