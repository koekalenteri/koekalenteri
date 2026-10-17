import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { createMatchMedia, flushPromises, renderWithUserEvents, runPendingTimers } from '../../test-utils/utils'
import AppSnackbarProvider from './AppSnackbarProvider'
import RegistrationForm from './RegistrationForm'

vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

// The shared mock prints a key and the names of its options; the amount to pay is the one value this
// file reads, so its line carries the amount itself.
vi.mock('react-i18next', async () => {
  const mocked = await import('../../__mocks__/react-i18next')
  return {
    ...mocked,
    useTranslation: () => {
      const translation = mocked.useTranslation()
      const t = (key: string, options: Record<string, unknown> = {}) =>
        key.startsWith('registration.paymentToBePaid')
          ? `${key} ${String(options.amount)}`
          : translation.t(key, options)
      return { ...translation, t }
    },
  }
})

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>{children}</AppSnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

/** A place, as the form's row holds it when the entry has been picked. */
const place = { date: eventWithStaticDates.startDate, key: 'place-ap', number: 1, time: 'ap' as const }

describe('RegistrationForm', () => {
  beforeAll(() => {
    // jsdom does not have matchMedia, so inject a polyfill
    window.matchMedia = createMatchMedia(window.innerWidth)
    vi.useFakeTimers()
  })
  afterEach(runPendingTimers)
  afterAll(() => vi.useRealTimers())

  // Each section's toggle button carries the section title as its accessible name (see
  // CollapsibleSection): the section content itself is covered by KOE-1318's own tests, so this
  // only checks the sections are all present and in the right order.
  const sectionTitles = () =>
    screen.getAllByRole('button', { name: /^registration\.\w+$/ }).map((el) => el.getAttribute('aria-label'))

  it('renders', async () => {
    render(<RegistrationForm event={eventWithStaticDates} registration={registrationWithStaticDates} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    expect(sectionTitles()).toEqual([
      'registration.class',
      'registration.dog',
      'registration.breeder',
      'registration.owners',
      'registration.handler',
      'registration.payer',
      'registration.qualifyingResults',
      'registration.notes',
      'registration.membership',
    ])
  })

  it('renders with invalid dog information', async () => {
    render(
      <RegistrationForm
        event={eventWithStaticDates}
        // @ts-expect-error Type 'undefined' is not assignable to type 'Dog'.ts(2322)
        registration={{ ...registrationWithStaticDates, dog: undefined }}
      />,
      { wrapper: Wrapper }
    )
    await flushPromises()

    // The section order is unaffected; the dog section itself falls back to an empty search.
    expect(sectionTitles()).toContain('registration.dog')
    expect(screen.getByRole('combobox', { name: 'dog.regNo' })).toHaveValue('')
  })

  it('should call onChange', async () => {
    const registration = { ...registrationWithStaticDates }

    const onChange = vi.fn().mockImplementation((props) => Object.assign(registration, props))

    const { user } = renderWithUserEvents(
      <RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    await flushPromises()
    const notes = screen.getByRole('textbox', { name: 'registration.notes' })

    await user.type(notes, ' more!')
    await flushPromises()

    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ notes: `${registrationWithStaticDates.notes} more!` })
    )
    expect(onChange).toHaveBeenCalledTimes(1)

    expect(notes).toHaveValue(`${registrationWithStaticDates.notes} more!`)
  })

  it('should normalize undefined owner role flags to booleans', async () => {
    const registration = {
      ...registrationWithStaticDates,
      ownerHandles: undefined,
      ownerPays: undefined,
    }

    const onChange = vi.fn().mockImplementation((props) => Object.assign(registration, props))

    render(<RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />, {
      wrapper: Wrapper,
    })

    await flushPromises()

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ownerHandles: true, ownerPays: true }))
    expect(registration.ownerHandles).toBe(true)
    expect(registration.ownerPays).toBe(true)
  })

  it('should not call onSave multiple times', async () => {
    const onSave = vi.fn()

    const { user } = renderWithUserEvents(
      <RegistrationForm
        changes
        event={eventWithStaticDates}
        registration={registrationWithStaticDates}
        onSave={onSave}
      />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    await flushPromises()
    const saveButton = screen.getByRole('button', { name: 'registration.cta.saveChanges' })

    expect(saveButton).toBeEnabled()

    await user.dblClick(saveButton)
    expect(onSave).toHaveBeenCalledTimes(1)
  })
  // KOE-1526 review: the server's due stands only for a fee that went back. A paid place whose price
  // changes in the form shows the new amount at once (KOE-722).
  it('shows what a change to a paid registration leaves to pay', async () => {
    const event = { ...eventWithStaticDates, cost: 130, costMember: 123 }
    const owner = { email: 'owner@example.com', location: 'Owner Location', name: 'Owner Name', phone: '+3584012345' }
    const paid = {
      ...registrationWithStaticDates,
      owner: { ...owner, membership: true },
      paidAmount: 123,
      payment: paymentPictureWith(),
    }
    const { rerender } = render(<RegistrationForm event={event} registration={paid} />, { wrapper: Wrapper })
    await flushPromises()
    expect(screen.getByText(/registration\.paymentToBePaid/)).toHaveTextContent('0,00')

    rerender(<RegistrationForm event={event} registration={{ ...paid, owner: { ...owner, membership: false } }} />)
    await flushPromises()

    expect(screen.getByText(/registration\.paymentToBePaid/)).toHaveTextContent('7,00')
  })

  // KOE-1526, KOE-1530: at confirmation-time payment the line follows the pay offer. The participant's
  // row has no group, so the server's picture says it: waiting for a place when paying is not offered
  // and no payment is held; the picture is the saved row's, as the server's answer was before it.
  describe("at confirmation-time payment, on the participant's row (no group)", () => {
    const event = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const { group: _group, ...participantRow } = unpaidRegistrationWithStaticDates
    const afterConfirmation = (amount: string) =>
      new RegExp(`^registration\\.paymentToBePaidAfterConfirmation ${amount}`)
    const atOnce = (amount: string) => new RegExp(`^registration\\.paymentToBePaid ${amount}`)

    // Paid at entry, nothing waits for a place: the picture's canPay says nothing of it.
    it('says the fee at once for a trial paid at entry, whatever canPay says', async () => {
      const entryEvent = { ...eventWithStaticDates, paymentTime: 'registration' as const }
      const payment = paymentPictureWith({ due: 123, standing: false, status: 'unpaid' })
      render(<RegistrationForm event={entryEvent} registration={{ ...participantRow, payment }} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      expect(screen.getByText(/^registration\.paymentToBePaid/)).toHaveTextContent(atOnce('123,00'))
    })

    it.each([
      [
        'a confirmed place whose pay link is offered',
        paymentPictureWith({ canPay: true, due: 123, standing: false, status: 'unpaid' }),
        {},
        atOnce('123,00'),
      ],
      [
        'a picked place not yet confirmed whose pay link is offered',
        paymentPictureWith({ canPay: true, due: 123, standing: false, status: 'unpaid' }),
        { confirmed: false, messagesSent: { picked: true } },
        atOnce('123,00'),
      ],
      [
        'a part paid place whose pay link is offered',
        paymentPictureWith({ canPay: true, due: 23, status: 'partial' }),
        { paidAmount: 100, paymentStatus: 'SUCCESS' as const },
        atOnce('23,00'),
      ],
      [
        'a payment in progress',
        paymentPictureWith({ due: 123, standing: false, status: 'inProgress' }),
        {},
        atOnce('123,00'),
      ],
      ['a payment charged twice', paymentPictureWith({ due: 123, status: 'duplicate' }), {}, atOnce('123,00')],
      [
        'a reserve that waits for a place',
        paymentPictureWith({ due: 123, standing: false, status: 'waitingForPlace' }),
        {},
        afterConfirmation('123,00'),
      ],
      [
        'a saved free class edited to a paid one',
        paymentPictureWith({ due: 0, standing: false, status: 'notCharged' }),
        {},
        afterConfirmation('123,00'),
      ],
      [
        'a part paid reserve',
        paymentPictureWith({ due: 23, status: 'partial' }),
        { paidAmount: 100, paymentStatus: 'SUCCESS' as const },
        afterConfirmation('23,00'),
      ],
    ])('says the fee for %s', async (_name, payment, overrides, text) => {
      render(<RegistrationForm event={event} registration={{ ...participantRow, ...overrides, payment }} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      expect(screen.getByText(/^registration\.paymentToBePaid/)).toHaveTextContent(text)
    })
  })

  it('says a new entry pays once its place is confirmed when the trial is paid at confirmation', async () => {
    const event = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const { group: _group, ...entry } = { ...unpaidRegistrationWithStaticDates, id: '' }
    render(<RegistrationForm event={event} registration={entry} />, { wrapper: Wrapper })
    await flushPromises()

    expect(screen.getByText(/^registration\.paymentToBePaid/)).toHaveTextContent(
      /^registration\.paymentToBePaidAfterConfirmation 123,00/
    )
  })

  // The secretary's row carries its group and no picture: the group says whether it has a place.
  it.each([
    ['a place', place, /^registration\.paymentToBePaid 123,00/],
    ['the reserve list', { ...place, key: 'reserve' }, /^registration\.paymentToBePaidAfterConfirmation 123,00/],
  ])("reads the secretary's row by its group: %s", async (_name, group, text) => {
    const event = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    render(<RegistrationForm event={event} registration={{ ...unpaidRegistrationWithStaticDates, group }} />, {
      wrapper: Wrapper,
    })
    await flushPromises()

    expect(screen.getByText(/^registration\.paymentToBePaid/)).toHaveTextContent(text)
  })

  it('should render optional costs', async () => {
    const event = {
      ...eventWithStaticDates,
      cost: {
        normal: 10,
        optionalAdditionalCosts: [
          { cost: 5, description: { fi: 'Cost 1' } },
          { cost: 10, description: { fi: 'Cost 2' } },
        ],
      },
    }
    const registration = {
      ...registrationWithStaticDates,
      optionalCosts: [0],
      paidAt: undefined,
      selectedCost: 'normal' as const,
    }
    const onChange = vi.fn().mockImplementation((props) => Object.assign(registration, props))

    const { user } = renderWithUserEvents(
      <RegistrationForm event={event} registration={registration} onChange={onChange} />,
      { wrapper: Wrapper },
      { advanceTimers: vi.advanceTimersByTime }
    )

    await flushPromises()

    const cb1 = screen.getByLabelText(/Cost 1/)
    expect(cb1).toBeChecked()

    const cb2 = screen.getByLabelText(/Cost 2/)
    expect(cb2).not.toBeChecked()

    await user.click(cb2)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionalCosts: [0, 1] }))

    await user.click(cb1)
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ optionalCosts: [1] }))
  })

  // KOE-525: the entry restrictions (KOE-524) gate the form. The mock dog is a curly coated
  // retriever (110) and nobody on the mock registration is a member.
  describe('entry restrictions', () => {
    it('keeps a non-member out of a members-only trial and says so in the membership section', async () => {
      render(
        <RegistrationForm
          event={{ ...eventWithStaticDates, restrictions: ['member'] }}
          registration={registrationWithStaticDates}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      // The mock t appends the option names to the key, so the notice reads "<key> breeds".
      expect(screen.getByText(/validation\.registration\.restrictedToMembers/)).toBeVisible()
      expect(screen.getByTestId('missing-info')).toHaveTextContent('registration.membership')
    })

    it('names the breeds when the trial is restricted to breeds alone, in the dog section', async () => {
      render(
        <RegistrationForm
          event={{ ...eventWithStaticDates, restrictions: ['122', '111'] }}
          registration={registrationWithStaticDates}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(screen.getByText(/validation\.registration\.restrictedToBreeds/)).toBeVisible()
      expect(screen.getByTestId('missing-info')).toHaveTextContent('registration.dog')
      expect(screen.queryByText(/validation\.registration\.restrictedToMembers/)).not.toBeInTheDocument()
    })

    it('lets a member through a trial restricted to members or named breeds', async () => {
      render(
        <RegistrationForm
          event={{ ...eventWithStaticDates, restrictions: ['member', '122'] }}
          registration={{
            ...registrationWithStaticDates,
            owner: { email: 'owner@example.com', membership: true, name: 'Owner Name' },
          }}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(screen.queryByText(/validation\.registration\.restrictedTo/)).not.toBeInTheDocument()
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument()
    })

    it('shows the secretary the notice but lets them save anyway', async () => {
      render(
        <RegistrationForm
          admin
          event={{ ...eventWithStaticDates, restrictions: ['member'] }}
          registration={registrationWithStaticDates}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(screen.getByText(/validation\.registration\.restrictedToMembers/)).toBeVisible()
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument()
    })

    it('lets a dog of a named breed through without a membership', async () => {
      render(
        <RegistrationForm
          event={{ ...eventWithStaticDates, restrictions: ['member', '110'] }}
          registration={registrationWithStaticDates}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(screen.queryByText(/validation\.registration\.restrictedTo/)).not.toBeInTheDocument()
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument()
    })
  })
})
