import type { ReactNode } from 'react'
import type { DeepPartial, Registration } from '@/types'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense, useState } from 'react'
import { registrationDogAged20MonthsAndNoResults } from '@/__mockData__/dogs'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import * as dogApi from '@/api/dog'
import { locales } from '@/i18n'
import { merge } from '@/lib/utils'
import { flushPromises, renderWithUserEvents, runAllTimers } from '@/test-utils/utils'
import AppSnackbarProvider from '../AppSnackbarProvider'
import { DogInfo } from './DogInfo'

const eventDate = registrationWithStaticDates.dates[0].date

vi.mock('@/api/dog')
vi.mock('@/api/registration')

function Wrapper(props: { readonly children?: ReactNode }) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
      <Provider>
        <AppSnackbarProvider>
          <Suspense fallback={<div>loading...</div>}>{props.children}</Suspense>
        </AppSnackbarProvider>
      </Provider>
    </LocalizationProvider>
  )
}

interface StatefulProps {
  readonly initial?: DeepPartial<Registration>
  readonly typedDogOnly?: boolean
  /** Hears the registration after every change, as the form would hold it. */
  readonly onRegistration?: (reg: DeepPartial<Registration>) => void
}

/** The section with its registration kept as the form keeps it, so a change reaches the next render. */
function StatefulDogInfo({ initial = {}, typedDogOnly, onRegistration }: StatefulProps) {
  const [reg, setReg] = useState<DeepPartial<Registration>>(initial)
  return (
    <DogInfo
      reg={reg}
      eventDate={eventDate}
      minDogAgeMonths={15}
      orgId="test"
      typedDogOnly={typedDogOnly}
      onChange={(changes, replace) =>
        setReg((prev) => {
          const next = replace ? { ...prev, ...changes } : merge(prev, changes)
          onRegistration?.(next)
          return next
        })
      }
    />
  )
}

/** A dog the registrant entered by hand: never fetched from Kennelliitto, so no refresh date (KOE-1651). */
const typedDogRegistration: DeepPartial<Registration> = {
  ...registrationWithStaticDates,
  dog: { ...registrationWithStaticDates.dog, refreshDate: undefined, regNo: 'EST-03101/26' },
}

const cachedDog = (regNo: string) => JSON.parse(localStorage.getItem('dog-cache') ?? '{}')[regNo]

describe('DogInfo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    localStorage.clear()
    runAllTimers()
    vi.useRealTimers()
  })

  it('should render', async () => {
    render(<DogInfo reg={registrationWithStaticDates} eventDate={eventDate} minDogAgeMonths={0} orgId="test" />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    expect(screen.getByRole('combobox', { name: 'dog.regNo' })).toHaveValue(registrationWithStaticDates.dog.regNo)
    expect(screen.getByRole('button', { name: 'registration.cta.update' })).toBeInTheDocument()
  })

  it('should allow changing dog', async () => {
    const reg = merge(registrationWithStaticDates, {})
    const changeHandler = vi.fn((props) => Object.assign(reg, props))
    const newDog = registrationDogAged20MonthsAndNoResults

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
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
        handler: undefined,
        owner: undefined,
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

    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: expect.objectContaining(newDog) }),
      true
    )
  })

  it('should automatically fetch when selecting from cached dogs', async () => {
    const reg = {}
    const changeHandler = vi.fn((props) => Object.assign(reg, props))

    // The real storage, which afterEach clears: a mocked getItem would outlive this test.
    localStorage.setItem('dog-cache', JSON.stringify({ 'TESTDOG-0020': {} }))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    expect(changeHandler).toHaveBeenCalledTimes(0)

    const input = screen.getByRole('combobox', { name: 'dog.regNo' })
    expect(input).toHaveValue('')
    await user.type(input, 't{ArrowDown}{Enter}')
    expect(input).toHaveValue('TESTDOG-0020')
    await flushPromises()

    expect(changeHandler).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: expect.objectContaining(registrationDogAged20MonthsAndNoResults) }),
      true
    )
  })

  it('should display friendly error when api call fails', async () => {
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 501 })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const reg = {}
    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      {
        wrapper: Wrapper,
      },
      { advanceTimers: vi.advanceTimersByTime }
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
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      {
        wrapper: Wrapper,
      },
      { advanceTimers: vi.advanceTimersByTime }
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

    const changeHandler = vi.fn((props) => Object.assign(reg, props))
    const refreshSpy = vi.spyOn(dogApi, 'getDog').mockResolvedValue(registrationDogAged20MonthsAndNoResults)

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
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
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const { user } = renderWithUserEvents(
      <StatefulDogInfo />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
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

  it('opens the chip for typing when the dog is entered by hand (KOE-1650)', async () => {
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })
    const { user } = renderWithUserEvents(
      <StatefulDogInfo />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await user.type(screen.getByRole('combobox', { name: 'dog.regNo' }), 'TESTDOG-0020')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
    await flushPromises()
    expect(screen.getByLabelText('dog.rfid')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'registration.cta.notfound' }))
    await flushPromises()

    expect(screen.getByLabelText('dog.rfid')).toBeEnabled()
  })

  it('looks any number up, but enters by hand only one in its registry form (KOE-1651)', async () => {
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })
    const { user } = renderWithUserEvents(
      <StatefulDogInfo />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await user.click(screen.getByRole('combobox', { name: 'dog.regNo' }))
    await user.paste('DK 21568/2021')
    await flushPromises()
    // Kennelliitto may know the dog by this spelling, so it can be looked up.
    await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
    await flushPromises()

    expect(screen.getByText('registration.cta.helper.notfound date')).toBeInTheDocument()
    expect(screen.getByText('validation.regNo.DK')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cta.notfound' })).toBeDisabled()
  })

  it('lets a number in its registry form not found be entered by hand (KOE-1651)', async () => {
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })
    const { user } = renderWithUserEvents(
      <StatefulDogInfo />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await user.type(screen.getByRole('combobox', { name: 'dog.regNo' }), 'DK21568/2021')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
    await flushPromises()

    expect(screen.queryByText(/^validation\.regNo\./)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cta.notfound' })).toBeEnabled()
  })

  it('keeps the spaces typed inside a number (KOE-1651)', async () => {
    const { user } = renderWithUserEvents(
      <StatefulDogInfo />,
      { wrapper: Wrapper },
      {
        advanceTimers: vi.advanceTimersByTime,
      }
    )

    await user.type(screen.getByRole('combobox', { name: 'dog.regNo' }), 'lsvk lr 1234/19')
    await flushPromises()

    expect(screen.getByRole('combobox', { name: 'dog.regNo' })).toHaveValue('LSVK LR 1234/19')
    expect(screen.getByRole('button', { name: 'registration.cta.fetch' })).toBeEnabled()
  })

  it('should reset form when clicking button in manual mode', async () => {
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const changeHandler = vi.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
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
    vi.spyOn(dogApi, 'getDog').mockResolvedValue(dogWithoutRfid)

    const reg = {}
    const changeHandler = vi.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
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
    vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })

    const reg = {}
    const changeHandler = vi.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} onChange={changeHandler} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
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

  it('should allow editing RFID on existing registration when RFID is empty string', async () => {
    const reg = merge(registrationWithStaticDates, {
      dog: {
        ...registrationWithStaticDates.dog,
        rfid: '',
        rfidEditable: true,
      },
    })

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    const rfidField = screen.getByLabelText('dog.rfid')
    expect(rfidField).toBeEnabled()

    await user.type(rfidField, '123456789012345')
    await flushPromises()

    expect(rfidField).toHaveValue('123456789012345')
  })

  it('stores a typed microchip without the spaces and invisible characters pasted with it (KOE-1650)', async () => {
    const onChange = vi.fn()
    const reg = merge(registrationWithStaticDates, {
      dog: { ...registrationWithStaticDates.dog, rfid: '', rfidEditable: true },
    })

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" onChange={onChange} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    const rfidField = screen.getByLabelText('dog.rfid')
    await user.click(rfidField)
    await user.paste('985 120\t012\u00a0345\u200b678 ')
    await flushPromises()
    runAllTimers()

    expect(rfidField).toHaveValue('985120012345678')
    expect(rfidField).toHaveAttribute('aria-invalid', 'false')
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ dog: expect.objectContaining({ rfid: '985120012345678' }) })
    )
  })

  it('neither opens nor marks the chip Kennelliitto gave a dog stored before kcId was kept (KOE-1650)', async () => {
    // Rows from before 6bf6c9354 (2024-08-05) hold no kcId on a dog fetched from Kennelliitto.
    const reg = merge(registrationWithStaticDates, {
      dog: { ...registrationWithStaticDates.dog, rfid: '9851200123456789' },
    })

    render(<DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />, { wrapper: Wrapper })
    await flushPromises()

    const rfidField = screen.getByLabelText('dog.rfid')
    expect(rfidField).toBeDisabled()
    expect(rfidField).toHaveAttribute('aria-invalid', 'false')
  })

  it('marks a typed microchip that is not 15 digits and says why (KOE-1650)', async () => {
    const reg = merge(registrationWithStaticDates, {
      dog: { ...registrationWithStaticDates.dog, rfid: '', rfidEditable: true },
    })

    const { user } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    const rfidField = screen.getByLabelText('dog.rfid')
    await user.type(rfidField, '623372020')
    await flushPromises()

    expect(rfidField).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('validation.registration.microchip')).toBeInTheDocument()
  })

  it('should disable RFID after update when refreshed dog has RFID', async () => {
    const reg = merge(registrationWithStaticDates, {
      dog: {
        ...registrationWithStaticDates.dog,
        rfid: '',
        rfidEditable: true,
      },
    })

    vi.spyOn(dogApi, 'getDog').mockResolvedValue({
      ...registrationDogAged20MonthsAndNoResults,
      rfid: '981000000000001',
    })

    const changeHandler = vi.fn((props) => Object.assign(reg, props))

    const { user, rerender } = renderWithUserEvents(
      <DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" onChange={changeHandler} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    const rfidField = screen.getByLabelText('dog.rfid')
    expect(rfidField).toBeEnabled()

    const updateButton = screen.getByRole('button', { name: 'registration.cta.update' })
    await user.click(updateButton)
    await flushPromises()

    rerender(<DogInfo reg={reg} eventDate={eventDate} minDogAgeMonths={15} orgId="test" onChange={changeHandler} />)
    await flushPromises()

    expect(screen.getByLabelText('dog.rfid')).toBeDisabled()
  })
  describe('a dog entered by hand that the registration holds (KOE-1651)', () => {
    it('marks a corrected number by its registry rule as it is typed', async () => {
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      // The hyphen out: "EST03101/26", which the loose lookup rule lets through.
      await user.type(input, '{Backspace}', { initialSelectionEnd: 4, initialSelectionStart: 4 })
      await flushPromises()

      expect(input).toHaveValue('EST03101/26')
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByText('validation.regNo.EST')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'registration.cta.fetch' })).toBeDisabled()
    })

    it('does not judge the number it was stored with', async () => {
      render(<StatefulDogInfo initial={merge(typedDogRegistration, { dog: { regNo: 'DK 21568/2021' } })} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      expect(screen.getByRole('combobox', { name: 'dog.regNo' })).toHaveAttribute('aria-invalid', 'false')
      expect(screen.queryByText(/^validation\.regNo\./)).not.toBeInTheDocument()
    })

    it('keeps the dog and its people when Kennelliitto does not know the corrected number', async () => {
      vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      await user.type(input, '{Backspace}2', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await flushPromises()
      expect(input).toHaveValue('EST-03102/26')
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()

      const { breeder, dog, handler, owner, ownerHandles, ownerPays } = registrationWithStaticDates
      expect(onRegistration).toHaveBeenLastCalledWith(
        expect.objectContaining({
          breeder,
          dog: expect.objectContaining({ dob: dog.dob, name: dog.name, regNo: 'EST-03102/26', rfid: dog.rfid }),
          handler,
          owner,
          ownerHandles,
          ownerPays,
        })
      )
      // On as the stored typed dog: details open, the number open for another correction, and the
      // registrant's own browser offers the dog by its new number.
      expect(screen.getByRole('button', { name: 'registration.cta.update' })).toBeDisabled()
      expect(screen.getByText('registration.cta.helper.typed date')).toBeInTheDocument()
      expect(input).toBeEnabled()
      expect(screen.getByLabelText('dog.name')).toBeEnabled()
      expect(screen.getByLabelText('dog.name')).toHaveValue('DOG NAME 10')
      expect(cachedDog('EST-03102/26')).toEqual(
        expect.objectContaining({ dog: expect.objectContaining({ name: dog.name }), manual: true })
      )
    })

    it('keeps the dog through a second correction of a kept number', async () => {
      vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      // A wrong correction first: EST-03101/27.
      await user.type(input, '{Backspace}7', { initialSelectionEnd: 12, initialSelectionStart: 12 })
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()
      expect(input).toBeEnabled()

      await user.type(input, '{Backspace}6', { initialSelectionEnd: 12, initialSelectionStart: 12 })
      await user.type(input, '{Backspace}2', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await flushPromises()
      expect(input).toHaveValue('EST-03102/26')
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()

      const { breeder, dog, handler, owner } = registrationWithStaticDates
      expect(onRegistration).toHaveBeenLastCalledWith(
        expect.objectContaining({
          breeder,
          dog: expect.objectContaining({ name: dog.name, regNo: 'EST-03102/26' }),
          handler,
          owner,
        })
      )
      expect(input).toBeEnabled()
    })

    it('keeps the dog when the lookup of the corrected number fails', async () => {
      vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 501 })
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      await user.type(input, '{Backspace}2', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()

      expect(errSpy).toHaveBeenCalledWith({ status: 501 })
      expect(onRegistration).not.toHaveBeenCalled()
      expect(screen.getByText('registration.cta.helper.error date')).toBeInTheDocument()

      // Entering it by hand goes on with the dog as it was typed, under the corrected number.
      await user.click(screen.getByRole('button', { name: 'registration.cta.error' }))
      await flushPromises()

      const { dog, owner } = registrationWithStaticDates
      expect(onRegistration).toHaveBeenLastCalledWith(
        expect.objectContaining({ dog: expect.objectContaining({ name: dog.name, regNo: 'EST-03102/26' }), owner })
      )
      expect(screen.getByLabelText('dog.name')).toBeEnabled()
    })

    it('takes the dog Kennelliitto knows by the corrected number', async () => {
      vi.spyOn(dogApi, 'getDog').mockResolvedValue(registrationDogAged20MonthsAndNoResults)
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      await user.clear(input)
      await user.type(input, registrationDogAged20MonthsAndNoResults.regNo)
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()

      expect(onRegistration).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dog: expect.objectContaining({ name: registrationDogAged20MonthsAndNoResults.name }),
        })
      )
      expect(screen.getByRole('button', { name: 'registration.cta.update' })).toBeInTheDocument()
    })

    it('keeps the dog when its number is emptied', async () => {
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      await user.clear(input)
      await flushPromises()

      expect(input).toHaveValue('')
      expect(onRegistration).not.toHaveBeenCalled()
      expect(screen.getByLabelText('dog.name')).toHaveValue('DOG NAME 10')
    })

    it('lets its name be corrected, and keeps the dog one typed by hand', async () => {
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const name = screen.getByLabelText('dog.name')
      expect(name).toBeEnabled()

      await user.type(name, ' II')
      await flushPromises()
      runAllTimers()

      expect(onRegistration).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dog: expect.objectContaining({ name: 'DOG NAME 10 II', regNo: 'EST-03101/26' }),
        })
      )
      expect(cachedDog('EST-03101/26')).toEqual(expect.objectContaining({ manual: true }))
    })

    it('keeps the dog when a corrected number is turned back to one cached as typed', async () => {
      vi.spyOn(dogApi, 'getDog').mockRejectedValue({ status: 404 })
      const onRegistration = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} onRegistration={onRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      // An edit caches the dog under its number as typed, with no people.
      await user.type(screen.getByLabelText('dog.name'), ' II')
      await flushPromises()
      runAllTimers()
      expect(cachedDog('EST-03101/26')).toEqual(expect.objectContaining({ manual: true }))

      await user.type(input, '{Backspace}2', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()
      await user.type(screen.getByLabelText('dog.name'), 'I')
      await flushPromises()
      runAllTimers()

      // The first number was right after all.
      await user.type(input, '{Backspace}1', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'registration.cta.fetch' }))
      await flushPromises()

      const { breeder, handler, owner } = registrationWithStaticDates
      expect(onRegistration).toHaveBeenLastCalledWith(
        expect.objectContaining({
          breeder,
          dog: expect.objectContaining({ name: 'DOG NAME 10 III', regNo: 'EST-03101/26' }),
          handler,
          owner,
        })
      )
      expect(input).toBeEnabled()
      expect(screen.getByRole('button', { name: 'registration.cta.update' })).toBeDisabled()
      expect(cachedDog('EST-03101/26')).toEqual(
        expect.objectContaining({
          dog: expect.objectContaining({ name: 'DOG NAME 10 III', regNo: 'EST-03101/26' }),
          manual: true,
        })
      )
    })

    it('keeps the dog cached as typed when its number is typed back and its name edited', async () => {
      const { user } = renderWithUserEvents(
        <StatefulDogInfo initial={typedDogRegistration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      const input = screen.getByRole('combobox', { name: 'dog.regNo' })

      await user.type(input, '{Backspace}2', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await user.type(input, '{Backspace}1', { initialSelectionEnd: 9, initialSelectionStart: 9 })
      await flushPromises()
      expect(input).toHaveValue('EST-03101/26')

      await user.type(screen.getByLabelText('dog.name'), ' II')
      await flushPromises()
      runAllTimers()

      expect(cachedDog('EST-03101/26')).toEqual(
        expect.objectContaining({ dog: expect.objectContaining({ name: 'DOG NAME 10 II' }), manual: true })
      )
    })

    it('keeps the name locked after the trial', async () => {
      render(<StatefulDogInfo initial={typedDogRegistration} typedDogOnly />, { wrapper: Wrapper })
      await flushPromises()

      expect(screen.getByLabelText('dog.name')).toBeDisabled()
    })
  })

  it('keeps the name of a dog fetched from Kennelliitto locked', async () => {
    render(<StatefulDogInfo initial={registrationWithStaticDates} />, { wrapper: Wrapper })
    await flushPromises()

    expect(screen.getByLabelText('dog.name')).toBeDisabled()
  })
})
