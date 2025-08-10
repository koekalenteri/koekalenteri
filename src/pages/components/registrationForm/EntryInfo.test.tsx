import type { ReactNode } from 'react'

import { Suspense } from 'react'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import {
  eventWithStaticDates,
  eventWithStaticDatesAnd3Classes,
  eventWithStaticDatesAndClass,
} from '../../../__mockData__/events'
import { registrationWithStaticDates, registrationWithStaticDatesAndClass } from '../../../__mockData__/registrations'
import { locales } from '../../../i18n'
import { merge } from '../../../lib/utils'
import { flushPromises, renderWithUserEvents } from '../../../test-utils/utils'

import { EntryInfo } from './EntryInfo'

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

describe('EntryInfo', () => {
  beforeAll(() => jest.useFakeTimers())
  afterEach(() => jest.runOnlyPendingTimers())
  afterAll(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it('should render with event without classes', async () => {
    const { container } = render(
      <EntryInfo reg={registrationWithStaticDates} event={eventWithStaticDates} errorStates={{}} helperTexts={{}} />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(container).toMatchSnapshot()
    expect(screen.queryByRole('combobox', { name: 'registration.class' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'registration.reserve' })).toBeInTheDocument()
  })

  it('should render with event with classes', async () => {
    const { container } = render(
      <EntryInfo
        reg={registrationWithStaticDatesAndClass}
        event={eventWithStaticDatesAndClass}
        errorStates={{}}
        helperTexts={{}}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    expect(container).toMatchSnapshot()
    expect(screen.getByRole('combobox', { name: 'registration.class' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'registration.reserve' })).toBeInTheDocument()
  })

  it('should allow changing class', async () => {
    const reg = merge(registrationWithStaticDatesAndClass, {})
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <EntryInfo
        reg={reg}
        event={eventWithStaticDatesAnd3Classes}
        errorStates={{}}
        helperTexts={{}}
        onChange={changeHandler}
      />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    const classInput = screen.getByRole('combobox', { name: 'registration.class' })
    expect(classInput).toHaveValue('ALO')

    await user.click(classInput)
    await flushPromises()

    const avoOption = screen.getByText('AVO')
    await user.click(avoOption)
    await flushPromises()

    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        class: 'AVO',
      })
    )
  })

  it('should clear class when event does not have classes', async () => {
    const reg = merge(registrationWithStaticDatesAndClass, {})
    const changeHandler = jest.fn()

    render(
      <EntryInfo reg={reg} event={eventWithStaticDates} errorStates={{}} helperTexts={{}} onChange={changeHandler} />,
      {
        wrapper: Wrapper,
      }
    )
    await flushPromises()

    expect(changeHandler).toHaveBeenCalledWith(expect.objectContaining({ class: undefined }))
  })

  it('should allow changing reserve option', async () => {
    const reg = merge(registrationWithStaticDates, {})
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    const { user } = renderWithUserEvents(
      <EntryInfo reg={reg} event={eventWithStaticDates} errorStates={{}} helperTexts={{}} onChange={changeHandler} />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    const reserveInput = screen.getByRole('combobox', { name: 'registration.reserve' })
    expect(reserveInput).toHaveValue('registration.reserveChoises.ANY')

    await user.click(reserveInput)
    await flushPromises()

    const dayOption = screen.getByText('registration.reserveChoises.DAY')
    await user.click(dayOption)
    await flushPromises()

    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        reserve: 'DAY',
      })
    )
  })

  it('should filter dates when multiple dates are available', async () => {
    const reg = merge(registrationWithStaticDates, {})
    const changeHandler = jest.fn((props) => Object.assign(reg, props))

    // ingnore react complaining about components with dublicate id
    jest.spyOn(console, 'error').mockImplementation(() => null)

    const { user } = renderWithUserEvents(
      <EntryInfo reg={reg} event={eventWithStaticDates} errorStates={{}} helperTexts={{}} onChange={changeHandler} />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    // Check if date filter is visible
    const dateFilter = screen.getByRole('combobox', { name: 'registration.datesFilter' })
    expect(dateFilter).toBeInTheDocument()

    // Click on the date filter
    await user.click(dateFilter)
    await flushPromises()

    // Select a specific date
    const dateOption = screen.getAllByRole('option')[0]
    await user.click(dateOption)
    await flushPromises()

    // Verify that onChange was called with updated dates
    expect(changeHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        dates: expect.any(Array),
      })
    )
  })

  it('should show error states when provided', async () => {
    render(
      <EntryInfo
        reg={registrationWithStaticDates}
        event={eventWithStaticDates}
        errorStates={{ class: true, dates: true, reserve: true }}
        helperTexts={{ class: 'Class error', dates: 'Dates error', reserve: 'Reserve error' }}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    // Check for error text
    expect(screen.getByText('validation.registration.required field')).toBeInTheDocument()

    // Check for specific error helper texts
    expect(screen.getByText('Reserve error')).toBeInTheDocument()
  })

  it('should handle disabled state', async () => {
    render(
      <EntryInfo
        reg={registrationWithStaticDatesAndClass}
        event={eventWithStaticDatesAndClass}
        errorStates={{}}
        helperTexts={{}}
        disabled={true}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    // Check that inputs are disabled
    const classInput = screen.getByRole('combobox', { name: 'registration.class' })
    expect(classInput).toBeDisabled()

    const reserveInput = screen.getByRole('combobox', { name: 'registration.reserve' })
    expect(reserveInput).toBeDisabled()
  })

  it('should handle class disabled state', async () => {
    render(
      <EntryInfo
        reg={registrationWithStaticDatesAndClass}
        event={eventWithStaticDatesAndClass}
        errorStates={{}}
        helperTexts={{}}
        classDisabled={true}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    // Check that class input is disabled but reserve is not
    const classInput = screen.getByRole('combobox', { name: 'registration.class' })
    expect(classInput).toBeDisabled()

    const reserveInput = screen.getByRole('combobox', { name: 'registration.reserve' })
    expect(reserveInput).not.toBeDisabled()
  })

  it('should handle open/close state', async () => {
    const onOpenChange = jest.fn()
    const { user } = renderWithUserEvents(
      <EntryInfo
        reg={registrationWithStaticDates}
        event={eventWithStaticDates}
        errorStates={{}}
        helperTexts={{}}
        open={false}
        onOpenChange={onOpenChange}
      />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )
    await flushPromises()

    // Find and click the section header to toggle open state
    const sectionHeader = screen.getAllByText('registration.class')[0]
    await user.click(sectionHeader)
    await flushPromises()

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })
})
