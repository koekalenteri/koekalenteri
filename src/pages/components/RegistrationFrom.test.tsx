import type { ReactNode } from 'react'

import { Suspense } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { RecoilRoot } from 'recoil'

import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { createMatchMedia, flushPromises, renderWithUserEvents } from '../../test-utils/utils'

import RegistrationForm from './RegistrationForm'

jest.mock('../../api/event')
jest.mock('../../api/eventType')
jest.mock('../../api/judge')
jest.mock('../../api/official')
jest.mock('../../api/organizer')
jest.mock('../../api/registration')

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <RecoilRoot>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>{children}</SnackbarProvider>
          </Suspense>
        </RecoilRoot>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationForm', () => {
  beforeAll(() => {
    // jsdom does not have matchMedia, so inject a polyfill
    window.matchMedia = createMatchMedia(window.innerWidth)
    jest.useFakeTimers()
  })
  afterEach(() => jest.clearAllTimers())
  afterAll(() => jest.useRealTimers())

  it('renders', async () => {
    const { container } = render(
      <RegistrationForm event={eventWithStaticDates} registration={registrationWithStaticDates} />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('renders with invalid dog information', async () => {
    const { container } = render(
      <RegistrationForm
        event={eventWithStaticDates}
        // @ts-expect-error Type 'undefined' is not assignable to type 'Dog'.ts(2322)
        registration={{ ...registrationWithStaticDates, dog: undefined }}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })

  it('should call onChange', async () => {
    const registration = { ...registrationWithStaticDates }

    const onChange = jest.fn().mockImplementation((props) => Object.assign(registration, props))

    const { user } = renderWithUserEvents(
      <RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    await flushPromises()
    const notes = screen.getByRole('textbox', { name: 'registration.notes' })

    await user.type(notes, ' more!')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ notes: registrationWithStaticDates.notes + ' more!' })
    )
    expect(onChange).toHaveBeenCalledTimes(1)

    expect(notes).toHaveValue(registrationWithStaticDates.notes + ' more!')
  })

  it('should not call onSave multiple times', async () => {
    const onSave = jest.fn()

    const { user } = renderWithUserEvents(
      <RegistrationForm
        changes
        event={eventWithStaticDates}
        registration={registrationWithStaticDates}
        onSave={onSave}
      />,
      { wrapper: Wrapper },
      { advanceTimers: jest.advanceTimersByTime }
    )

    await flushPromises()
    const saveButton = screen.getByRole('button', { name: 'Tallenna muutokset' })

    expect(saveButton).toBeEnabled()

    await user.dblClick(saveButton)
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
