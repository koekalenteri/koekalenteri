import { ReactNode, Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationDogAged20MonthsAndNoResults } from '../../../__mockData__/dogs'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import * as dogApi from '../../../api/dog'
import { locales } from '../../../i18n'
import { renderWithUserEvents, waitForDebounce } from '../../../test-utils/utils'
import { merge } from '../../../utils'

import { DogInfo } from './DogInfo'

const eventDate = registrationWithStaticDates.dates[0].date

jest.mock('../../../api/dog')
jest.mock('../../../api/registration')
jest.setTimeout(10000)

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
    await waitForDebounce()
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
    await waitForDebounce()

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

  it('should display friendly error when api call fails', async () => {
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 501 })

    const reg = {}
    const { user } = renderWithUserEvents(<DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} />, {
      wrapper: Wrapper,
    })

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    expect(input).toHaveValue('TESTDOG-0020')
    await waitForDebounce()

    const button = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(button)

    expect(button.textContent).toEqual('registration.cta.error')
    expect(screen.getByText('registration.cta.helper.error')).toBeInTheDocument()
  })

  it('should display friendly error when dog is not found', async () => {
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const { user } = renderWithUserEvents(<DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} />, {
      wrapper: Wrapper,
    })

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    expect(input).toHaveValue('TESTDOG-0020')
    await waitForDebounce()

    const button = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(button)

    expect(button.textContent).toEqual('registration.cta.notfound')
    expect(screen.getByText('registration.cta.helper.notfound')).toBeInTheDocument()
  })
})
