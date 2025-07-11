import type { ReactNode } from 'react'

import { Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { registrationDogAged20MonthsAndNoResults } from '../../../__mockData__/dogs'
import { registrationWithStaticDates } from '../../../__mockData__/registrations'
import * as dogApi from '../../../api/dog'
import { locales } from '../../../i18n'
import { merge } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import { DogInfo } from './DogInfo'

const eventDate = registrationWithStaticDates.dates[0].date

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

describe('DogInfo', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    localStorage.clear()
    jest.runAllTimers()
    jest.useRealTimers()
  })

  it('should render', async () => {
    const { container } = render(
      <DogInfo reg={registrationWithStaticDates} eventDate={eventDate} minDogAgeMonths={0} orgId="test" />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(container).toMatchSnapshot()
  })

  it('should allow changing dog', async () => {
    const reg = merge(registrationWithStaticDates, {})
    const changeHandler = jest.fn((props) => Object.assign(reg, props))
    const newDog = registrationDogAged20MonthsAndNoResults

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    expect(input).toHaveValue('TESTDOG-0010')

    await user.clear(input)
    expect(input).toHaveValue('')
    await flushPromises()
    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dog: expect.objectContaining({ regNo: '' }),
        owner: undefined,
        handler: undefined,
        ownerHandles: true,
        ownerPays: true,
        results: [],
      }),
      true
    )

    await user.type(input, newDog.regNo)
    expect(input).toHaveValue(newDog.regNo)
    await flushPromises()

    const button = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(button)
    await flushPromises()

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
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    expect(input).toHaveValue('')
    await user.type(input, 't{ArrowDown}{Enter}')
    expect(input).toHaveValue('TESTDOG-0020')
    await flushPromises()

    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: registrationDogAged20MonthsAndNoResults }),
      true
    )
  })

  it('should display friendly error when api call fails', async () => {
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 501 })
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

    const reg = {}
    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      {
        wrapper: Wrapper,
      },
      { advanceTimers: jest.advanceTimersByTime }
    )

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    await flushPromises()
    expect(input).toHaveValue('TESTDOG-0020')

    const button = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(button)
    await flushPromises()

    expect(button.textContent).toEqual('registration.cta.error')
    expect(screen.getByText('registration.cta.helper.error date')).toBeInTheDocument()

    errSpy.mockRestore()
  })

  it('should display friendly error when dog is not found', async () => {
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      {
        wrapper: Wrapper,
      },
      { advanceTimers: jest.advanceTimersByTime }
    )

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    await flushPromises()
    expect(input).toHaveValue('TESTDOG-0020')

    const button = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(button)
    await flushPromises()

    expect(button.textContent).toEqual('registration.cta.notfound')
    expect(screen.getByText('registration.cta.helper.notfound date')).toBeInTheDocument()
  })
  it('should allow refreshing dog data', async () => {
    // Ensure we have a valid dog with regNo for testing refresh
    const testDog = {
      ...registrationDogAged20MonthsAndNoResults,
      refreshDate: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago
    }

    const reg = {
      dog: testDog,
    }

    const changeHandler = jest.fn((props) => Object.assign(reg, props))
    const refreshSpy = jest.spyOn(dogApi, 'getDog').mockResolvedValue(registrationDogAged20MonthsAndNoResults)

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    const button = screen.getByRole('button', { name: 'registration.cta.update' })
    expect(button).toBeEnabled()

    await user.click(button)
    await flushPromises()

    expect(refreshSpy).toHaveBeenCalledWith(testDog.regNo, true)
    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        dog: expect.objectContaining(registrationDogAged20MonthsAndNoResults),
      }),
      false
    )
  })

  it('should transition to manual mode when clicking button in notfound state', async () => {
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    // First get to notfound state
    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    await flushPromises()

    const fetchButton = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(fetchButton)
    await flushPromises()

    // Now we should be in notfound state
    const notfoundButton = screen.getByRole('button', { name: 'registration.cta.notfound' })
    await user.click(notfoundButton)
    await flushPromises()

    // Check that manual entry fields are enabled
    const breedField = screen.getByRole('combobox', { name: 'dog.breed' })
    expect(breedField).toBeEnabled()

    const genderField = screen.getByRole('combobox', { name: 'dog.gender' })
    expect(genderField).toBeEnabled()

    // Button should now show reset
    const resetButton = screen.getByRole('button', { name: 'registration.cta.manual' })
    expect(resetButton).toBeInTheDocument()
  })

  it('should reset form when clicking button in manual mode', async () => {
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    // First get to notfound state
    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    await flushPromises()

    const fetchButton = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(fetchButton)
    await flushPromises()

    // Now transition to manual mode
    const notfoundButton = screen.getByRole('button', { name: 'registration.cta.notfound' })
    await user.click(notfoundButton)
    await flushPromises()

    // Now click reset
    const resetButton = screen.getByRole('button', { name: 'registration.cta.manual' })
    await user.click(resetButton)
    await flushPromises()

    // Should be back to fetch mode with empty reg no
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: 'registration.cta.fetch' })).toBeInTheDocument()

    // Should have called onChange with empty dog
    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        dog: expect.objectContaining({ regNo: '' }),
      }),
      true
    )
  })

  it('should allow inputting RFID when dog is found from API but has no RFID', async () => {
    // Create a dog without RFID
    const dogWithoutRfid = {
      ...registrationDogAged20MonthsAndNoResults,
      rfid: undefined, // Dog has no RFID
    }

    // Mock the API to return a dog without RFID
    jest.spyOn(dogApi, 'getDog').mockResolvedValue(dogWithoutRfid)

    const reg = {}
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    // Enter a registration number
    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    await flushPromises()

    // Click fetch button to get the dog data
    const fetchButton = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(fetchButton)
    await flushPromises()

    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        dog: expect.objectContaining({
          rfid: undefined,
        }),
      }),
      true // replace
    )

    // Verify the dog was fetched and the RFID field is enabled
    const rfidField = screen.getByLabelText('dog.rfid')
    expect(rfidField).toBeEnabled()

    // Verify the RFID field is empty
    expect(rfidField).toHaveValue('')

    // Input an RFID
    const newRfid = '9876543210987654'
    await user.type(rfidField, newRfid)
    await flushPromises()

    // Verify the RFID was updated
    expect(rfidField).toHaveValue(newRfid)

    // Verify the onChange handler was called with the updated RFID
    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        dog: expect.objectContaining({
          rfid: newRfid,
        }),
      })
    )
  })

  it('should disable RFID field when dog is not found from API', async () => {
    // Mock the API to return a 404 error (dog not found)
    jest.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    // Enter a registration number
    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    await user.type(input, 'TESTDOG-0020')
    await flushPromises()

    // Click fetch button to get the dog data
    const fetchButton = screen.getByRole('button', { name: 'registration.cta.fetch' })
    await user.click(fetchButton)
    await flushPromises()

    // Verify we're in "notfound" state
    expect(screen.getByRole('button', { name: 'registration.cta.notfound' })).toBeInTheDocument()
    expect(screen.getByText('registration.cta.helper.notfound date')).toBeInTheDocument()

    // Verify the RFID field is disabled
    const rfidField = screen.getByLabelText('dog.rfid')
    expect(rfidField).toBeDisabled()
  })
})
