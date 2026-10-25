import type { ReactNode } from 'react'
import type { Registration } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen, within } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense, useState } from 'react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { frozenInstant } from '../../test-utils/freezeClock'
import { describeInTimeZone } from '../../test-utils/timeZone'
import {
  createMatchMedia,
  flushPromises,
  renderWithUserEvents,
  runPendingTimers,
  typeDateKeyByKey,
} from '../../test-utils/utils'
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
      const t = (key: string, options: Record<string, unknown> = {}) => {
        if (key.startsWith('registration.paymentToBePaid')) return `${key} ${String(options.amount)}`
        // The locked-change notice is read by its reason and section.
        if (key === 'registration.lockedChange') return `${key} ${String(options.reason)} ${String(options.section)}`
        return translation.t(key, options)
      }
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

  // The sections start in the state the screen size gives them, so a section that stays closed
  // without a dog never renders open first and collapses after (KOE-1573). The timers do not run
  // here: a section that opened and is closing is still visible until its exit transition ends.
  it('renders the breeder and owner sections closed from the start when no dog is chosen', () => {
    render(
      <RegistrationForm
        event={eventWithStaticDates}
        // @ts-expect-error Type 'undefined' is not assignable to type 'Dog'.ts(2322)
        registration={{ ...registrationWithStaticDates, dog: undefined }}
      />,
      { wrapper: Wrapper }
    )

    for (const id of ['breeder_name', 'owner_0_name']) {
      expect(document.getElementById(id)).toBeInTheDocument()
      expect(document.getElementById(id)).not.toBeVisible()
    }
  })

  it('renders the dog section closed from the start on a small screen', () => {
    window.matchMedia = createMatchMedia(400)
    try {
      render(<RegistrationForm event={eventWithStaticDates} registration={registrationWithStaticDates} />, {
        wrapper: Wrapper,
      })

      // A hidden field has no accessible name, so the registration number field is found by its id.
      expect(document.getElementById('txtReknro')).toBeInTheDocument()
      expect(document.getElementById('txtReknro')).not.toBeVisible()
    } finally {
      window.matchMedia = createMatchMedia(window.innerWidth)
    }
  })

  // On a small screen a toggle closes the other sections; the secretary's notes keep what the
  // secretary last chose for them (KOE-1573). Toggling the notes twice in a row is what used to
  // lose it: the second toggle was not recorded in the section itself, and the next toggle of
  // another section handed the notes back to the section's own, stale state.
  describe("the secretary's notes on a small screen", () => {
    const notesToggle = 'registration.secretaryNotes'
    const classToggle = 'registration.class'

    it.each([
      { clicks: [notesToggle, notesToggle, classToggle], visible: true, when: 'reopened' },
      { clicks: [notesToggle, classToggle, notesToggle, notesToggle, classToggle], visible: false, when: 'closed' },
    ])('stay $when when another section is toggled', async ({ clicks, visible }) => {
      window.matchMedia = createMatchMedia(400)
      try {
        const { user } = renderWithUserEvents(
          <RegistrationForm
            admin
            event={eventWithStaticDates}
            onInternalNotesChange={vi.fn()}
            registration={{ ...registrationWithStaticDates, id: 'reg-1' }}
          />,
          { wrapper: Wrapper },
          { advanceTimers: vi.advanceTimersByTime }
        )
        await flushPromises()
        const notes = document.querySelector('textarea[name="internalNotes"]')
        expect(notes).toBeVisible()

        for (const name of clicks) {
          await user.click(screen.getByRole('button', { name }))
        }
        await runPendingTimers()

        if (visible) {
          expect(notes).toBeVisible()
        } else {
          expect(notes).not.toBeVisible()
        }
      } finally {
        window.matchMedia = createMatchMedia(window.innerWidth)
      }
    })
  })

  // Kennelliitto's empty date reaches the form as no birth day (KOE-1548). The entry is unpaid: a paid
  // one's dog is locked, and its errors no longer hold the participant back (KOE-1588).
  it('renders a dog without a birth day as too young', async () => {
    const registration = {
      ...unpaidRegistrationWithStaticDates,
      dog: { ...unpaidRegistrationWithStaticDates.dog, dob: undefined },
    }
    render(<RegistrationForm event={eventWithStaticDates} registration={registration} />, { wrapper: Wrapper })
    await flushPromises()

    expect(sectionTitles()).toContain('registration.dog')
    expect(screen.getAllByText(/validation\.registration\.dogAge/).length).toBeGreaterThan(0)
  })

  describe("the dob picker's days (KOE-1556)", () => {
    // Today is 1.1.2021 and the trial starts on 10.2.2021. The dog has Kennelliitto's empty birth
    // date, so the dob is entered by hand and its picker is enabled; it opens on the year view.
    beforeEach(() => vi.setSystemTime(frozenInstant('2021-01-01')))
    // The file's fake timers started from the real time; later tests get it back.
    afterEach(() => vi.setSystemTime(vi.getRealSystemTime()))

    const openDobPicker = async (eventType: string) => {
      const registration = {
        ...unpaidRegistrationWithStaticDates,
        dog: { ...unpaidRegistrationWithStaticDates.dog, dob: undefined },
      }
      const { user } = renderWithUserEvents(
        <RegistrationForm event={{ ...eventWithStaticDates, eventType }} registration={registration} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()
      await user.click(screen.getByRole('button', { name: /choose date/i }))
      const dialog = await screen.findByRole('dialog')
      const years = within(dialog)
        .getAllByRole('radio')
        .map((year) => year.textContent)
      /** The days the picker offers in the month, after choosing its year and month (0 is January). */
      const daysIn = async (year: string, monthIndex: number) => {
        await user.click(within(dialog).getByRole('radio', { name: year }))
        await user.click(within(dialog).getAllByRole('radio')[monthIndex])
        return within(dialog)
          .getAllByRole('gridcell')
          .filter((cell) => cell.textContent !== '' && !cell.hasAttribute('disabled'))
          .map((cell) => Number(cell.textContent))
      }
      return { daysIn, years }
    }

    it('ends nine months before a NOU trial, as its age limit', async () => {
      const { daysIn, years } = await openDobPicker('NOU')
      expect(years.at(-1)).toBe('2020')
      expect((await daysIn('2020', 4)).at(-1)).toBe(10)
    })

    it('ends on the trial day itself for a type without an age limit', async () => {
      const { daysIn, years } = await openDobPicker('NOME-B')
      expect(years.at(-1)).toBe('2021')
      expect((await daysIn('2021', 1)).at(-1)).toBe(10)
    })

    it('starts fifteen years before today', async () => {
      const { daysIn, years } = await openDobPicker('NOU')
      expect(years[0]).toBe('2006')
      expect((await daysIn('2006', 0))[0]).toBe(1)
    })

    // Typed key by key, the year passes through 2, 20 and 202: whole dates but no days. The field keeps
    // what is typed and the form gets the day as a key, in every zone (KOE-1481, KOE-1548).
    describe.each(['Europe/Helsinki', 'America/New_York', 'Asia/Tokyo'])('typed in %s', (zone) => {
      describeInTimeZone(zone, () => {
        it('keeps a birth date typed into the empty field and stores it as a key', async () => {
          const registration = {
            ...unpaidRegistrationWithStaticDates,
            dog: { ...unpaidRegistrationWithStaticDates.dog, dob: undefined },
          }
          const onChange = vi.fn()
          const { user } = renderWithUserEvents(
            <RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />,
            { wrapper: Wrapper },
            { advanceTimers: vi.advanceTimersByTime }
          )
          await flushPromises()
          const group = screen.getByRole('group', { name: 'dog.dob' })

          await typeDateKeyByKey(user, group, '15032020')
          await runPendingTimers()

          expect(group).toHaveTextContent('15.03.2020')
          expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({ dog: expect.objectContaining({ dob: '2020-03-15' }) })
          )
        })
      })
    })
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

  // Unpaid: once paid the stored selection stands, as an unset one counts the handler's membership (KOE-1588).
  it('should normalize undefined owner role flags to booleans', async () => {
    const registration = {
      ...unpaidRegistrationWithStaticDates,
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

  // KOE-1552: the participant's row carries the saved row's picture, but the line reads the row being
  // edited, so a service chosen before paying adds to what is owed at once (KOE-722).
  it("shows what an added service leaves to pay on a row that carries the server's picture", async () => {
    const event = {
      ...eventWithStaticDates,
      cost: { normal: 123, optionalAdditionalCosts: [{ cost: 15, description: { fi: 'Ruoka' } }] },
    }
    const { group: _group, ...participantRow } = unpaidRegistrationWithStaticDates
    const saved = {
      ...participantRow,
      optionalCosts: [],
      payment: paymentPictureWith({ due: 123, standing: false, status: 'unpaid' }),
    }
    const { rerender } = render(<RegistrationForm event={event} registration={saved} />, { wrapper: Wrapper })
    await flushPromises()
    expect(screen.getByText(/registration\.paymentToBePaid/)).toHaveTextContent('123,00')

    rerender(<RegistrationForm event={event} registration={{ ...saved, optionalCosts: [0] }} />)
    await flushPromises()

    expect(screen.getByText(/registration\.paymentToBePaid/)).toHaveTextContent('138,00')
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
  // retriever (110) and nobody on the mock registration is a member. The entry is unpaid: a paid
  // one's dog and memberships are locked, and a restriction only they decide no longer gates it (KOE-1588).
  describe('entry restrictions', () => {
    it('keeps a non-member out of a members-only trial and says so in the membership section', async () => {
      render(
        <RegistrationForm
          event={{ ...eventWithStaticDates, restrictions: ['member'] }}
          registration={unpaidRegistrationWithStaticDates}
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
          registration={unpaidRegistrationWithStaticDates}
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

  // The sections close for the participant one by one, by the rule PutRegistration holds them by
  // (`getParticipantFieldLocks`, KOE-1588). The file's clock is the real one; these set the day.
  describe('participant field locks (KOE-1588)', () => {
    const entryOpen = () => vi.setSystemTime(frozenInstant(eventWithStaticDates.entryStartDate))
    const trialDay = () => vi.setSystemTime(frozenInstant(eventWithStaticDates.startDate))
    afterEach(() => vi.setSystemTime(vi.getRealSystemTime()))

    // Unpaid, without the money fields at all: a field held as undefined counts as missing in the form.
    const { paidAmount: _amount, paidAt: _at, paymentStatus: _status, ...unpaid } = registrationWithStaticDates
    const picked: Registration = { ...unpaid, messagesSent: { picked: true } }
    const reserveEntrant: Registration = { ...unpaid, messagesSent: { reserve: true } }
    const regNoField = () => screen.getByRole('combobox', { name: 'dog.regNo' })
    const reserveField = () => screen.getByRole('combobox', { name: 'registration.reserve' })
    const notesField = () => screen.getByRole('textbox', { name: 'registration.notes' })
    const saveButton = () => screen.getByRole('button', { name: 'registration.cta.saveChanges' })

    it('locks the dog of a picked entry before it is paid', async () => {
      entryOpen()
      render(<RegistrationForm event={eventWithStaticDates} registration={picked} />, { wrapper: Wrapper })
      await flushPromises()

      expect(regNoField()).toBeDisabled()
      expect(notesField()).toBeEnabled()
    })

    it('locks the class and the days of a reserve entrant on a trial day', async () => {
      trialDay()
      render(<RegistrationForm event={eventWithStaticDates} registration={reserveEntrant} />, { wrapper: Wrapper })
      await flushPromises()

      expect(reserveField()).toBeDisabled()
      expect(regNoField()).toBeEnabled()
    })

    it('leaves the class and the days of a reserve entrant open while the entry is open', async () => {
      entryOpen()
      render(<RegistrationForm event={eventWithStaticDates} registration={reserveEntrant} />, { wrapper: Wrapper })
      await flushPromises()

      expect(reserveField()).toBeEnabled()
    })

    // What only a locked section holds cannot keep the participant from saving the notes: a dog
    // without a microchip number, a qualification the class and the results no longer give, and a
    // members-only restriction the paid entry does not meet.
    it('lets a picked and paid entry with errors in its locked sections save', async () => {
      entryOpen()
      const registration: Registration = {
        ...registrationWithStaticDates,
        dog: { ...registrationWithStaticDates.dog, rfid: '' },
        messagesSent: { picked: true },
        qualifies: false,
      }
      render(
        <RegistrationForm
          changes
          event={{ ...eventWithStaticDates, restrictions: ['member'] }}
          registration={registration}
          savedRegistration={registration}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(saveButton()).toBeEnabled()
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument()
    })

    // The mock dog is a curly coated retriever (110): only the dog could meet a trial for another
    // breed, and a picked entry's dog is locked; a members-only trial is met through the memberships,
    // which stay open until paid (`isEntryRestrictionLocked`, which PutRegistration reads too).
    it.each([
      ['lets a picked entry save on a trial for another breed', ['122'], true],
      ['keeps holding back a picked entry on a members-only trial', ['member'], false],
    ])('%s', async (_label, restrictions, saves) => {
      entryOpen()
      render(
        <RegistrationForm
          changes
          event={{ ...eventWithStaticDates, restrictions }}
          registration={picked}
          savedRegistration={picked}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      if (saves) expect(saveButton()).toBeEnabled()
      else expect(saveButton()).toBeDisabled()
    })

    it('keeps every section open for the secretary on a picked and paid entry', async () => {
      trialDay()
      const registration: Registration = { ...registrationWithStaticDates, messagesSent: { picked: true } }
      render(<RegistrationForm admin event={eventWithStaticDates} registration={registration} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      expect(regNoField()).toBeEnabled()
      expect(reserveField()).toBeEnabled()
      expect(screen.getAllByRole('textbox', { name: 'contact.name' })[0]).toBeEnabled()
      expect(screen.getAllByRole('checkbox', { name: /registration\.isMember/ })[0]).toBeEnabled()
    })

    it('keeps holding back an entry whose open sections have errors', async () => {
      entryOpen()
      const registration: Registration = { ...picked, payer: { email: '', name: '', phone: '' } }
      render(<RegistrationForm changes event={eventWithStaticDates} registration={registration} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      expect(saveButton()).toBeDisabled()
      const missing = within(screen.getByTestId('missing-info')).getAllByRole('listitem', { hidden: true })
      expect(missing.map((item) => item.textContent?.trim())).toEqual(['registration.payer defaultValue'])
    })

    // The form writes the first owner into an unset selection; a picked entry's stands as stored, and
    // so does a paid one's, where the unset selection counts the handler's membership (`isMember`).
    it.each([
      ['a picked entry', () => picked],
      ['a paid entry not yet picked', () => registrationWithStaticDates],
    ])('leaves the unset owner selections of %s as they are', async (_label, entry) => {
      entryOpen()
      const { ownerHandles: _h, ownerPays: _p, ...stored } = entry()
      const onChange = vi.fn()
      render(<RegistrationForm event={eventWithStaticDates} registration={stored} onChange={onChange} />, {
        wrapper: Wrapper,
      })
      await flushPromises()

      expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ ownerHandles: true }))
    })

    // A day the trial no longer has: the form would put the trial's days in its place.
    it.each([
      ['picks the trial days for', unpaidRegistrationWithStaticDates, true],
      ['leaves the day of', picked, false],
    ] as const)('%s an entry whose day the trial no longer has', async (_label, entry, rewritten) => {
      entryOpen()
      const onChange = vi.fn()
      const registration = { ...entry, dates: [{ date: '2021-02-12' as const, time: 'ap' as const }] }
      render(<RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />, {
        wrapper: Wrapper,
      })
      await flushPromises()
      await runPendingTimers()

      if (rewritten) expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dates: expect.any(Array) }))
      else expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ dates: expect.any(Array) }))
    })

    // The owner who handled a paid entry is a member; the draft names Bob apart, who would carry the
    // owner's membership. Bob is someone added after paying and claims none.
    it("gives a handler named apart on a paid entry no membership of the owner's", async () => {
      entryOpen()
      const memberOwner = {
        email: 'owner@example.com',
        key: 'a',
        location: 'Owner Location',
        membership: true,
        name: 'Owner Name',
        phone: '+3584012345',
      }
      const saved: Registration = {
        ...registrationWithStaticDates,
        handler: memberOwner,
        owner: memberOwner,
        ownerHandles: 'a',
        owners: [memberOwner],
      }
      const bob = { email: 'bob@example.com', membership: true, name: 'Bob', phone: '+358401111111' }
      const onChange = vi.fn()
      render(
        <RegistrationForm
          event={eventWithStaticDates}
          registration={{ ...saved, handler: bob, ownerHandles: false }}
          savedRegistration={saved}
          onChange={onChange}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ handler: { ...bob, membership: false } }))
    })

    /** The form with a draft of its own, as the edit page holds one: every change is fed back in. */
    function Draft({
      onChange,
      saved,
    }: {
      readonly onChange: (r: Registration) => void
      readonly saved: Registration
    }) {
      const [draft, setDraft] = useState(saved)
      return (
        <RegistrationForm
          event={eventWithStaticDates}
          registration={draft}
          savedRegistration={saved}
          onChange={(changed) => {
            onChange(changed)
            setDraft(changed)
          }}
        />
      )
    }

    // The member price was paid on the separate handler's membership alone: letting the owner, no
    // member, handle instead would drop it, so the form puts the people back and says why (the user's
    // decision, 25.10.2026). A notes edit says nothing.
    describe('on a paid entry that is a member only through its separate handler', () => {
      const saved: Registration = {
        ...registrationWithStaticDates,
        handler: { email: 'handler@example.com', membership: true, name: 'Handler Name' },
      }
      const renderDraft = () =>
        renderWithUserEvents(
          <Draft onChange={vi.fn()} saved={saved} />,
          { wrapper: Wrapper },
          { advanceTimers: vi.advanceTimersByTime }
        )

      it('tells why letting the owner handle is put back', async () => {
        entryOpen()
        const { user } = renderDraft()
        await flushPromises()
        expect(screen.queryByRole('alert')).not.toBeInTheDocument()

        await user.click(screen.getAllByRole('radio', { name: 'Owner Name' })[0])
        await flushPromises()

        expect(screen.getByRole('alert')).toHaveTextContent(
          'registration.lockedChange registration.lockedReason.paid registration.lockedSection.membership'
        )
        expect(screen.getAllByRole('radio', { name: 'registration.someoneElse' })[0]).toBeChecked()
      })

      it('says nothing of a notes edit', async () => {
        entryOpen()
        const { user } = renderDraft()
        await flushPromises()

        await user.type(screen.getByRole('textbox', { name: 'registration.notes' }), ' more')
        await flushPromises()

        expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      })
    })

    // The member owner handled a paid entry; the participant names someone else. The handler field
    // starts as the owner's copy and its membership, and the new person claims none, by the lock's own
    // rule: nothing is put back and nothing is said.
    it('names someone else to handle a paid entry without a notice, the new handler claiming no membership', async () => {
      entryOpen()
      const memberOwner = { email: 'owner@example.com', membership: true, name: 'Owner Name', phone: '+3584012345' }
      const saved: Registration = {
        ...registrationWithStaticDates,
        handler: memberOwner,
        owner: memberOwner,
        ownerHandles: true,
      }
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(
        <Draft onChange={onChange} saved={saved} />,
        { wrapper: Wrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await user.click(screen.getAllByRole('radio', { name: 'registration.someoneElse' })[0])
      await flushPromises()
      const handlerName = document.getElementById('handler_name')
      if (!handlerName) throw new Error('no handler name field')
      await user.clear(handlerName)
      await user.type(handlerName, 'Bob')
      await flushPromises()
      await runPendingTimers()

      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ handler: expect.objectContaining({ membership: false, name: 'Bob' }) })
      )
    })

    // The handler's place is the person: correcting a member handler's name on a paid entry keeps the
    // membership, and the form does not put the stored name back.
    it("keeps a correction of a paid entry's member handler", async () => {
      entryOpen()
      const memberHandler = { email: 'handler@example.com', membership: true, name: 'Handler Name' }
      const saved: Registration = { ...registrationWithStaticDates, handler: memberHandler }
      const onChange = vi.fn()
      render(
        <RegistrationForm
          event={eventWithStaticDates}
          registration={{
            ...saved,
            handler: { ...memberHandler, name: 'Handler Named Right' },
          }}
          savedRegistration={saved}
          onChange={onChange}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(onChange).not.toHaveBeenCalledWith(
        expect.objectContaining({ handler: expect.objectContaining({ name: 'Handler Name' }) })
      )
    })

    // A row stored with a single `owner`: the membership checkbox writes it as a list of one, which the
    // picked entry's locked people section reads as the same owners.
    it('keeps a membership written as a list on a picked entry stored with a single owner', async () => {
      entryOpen()
      const owners = [
        { ...picked.owner, email: 'owner@example.com', key: 'owner-1', membership: true, name: 'Owner Name' },
      ]
      const onChange = vi.fn()
      render(
        <RegistrationForm
          event={eventWithStaticDates}
          registration={{
            ...picked,
            owner: { ...picked.owner, email: 'owner@example.com', membership: true, name: 'Owner Name' },
            owners,
          }}
          savedRegistration={picked}
          onChange={onChange}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()

      expect(onChange).not.toHaveBeenCalledWith(expect.not.objectContaining({ owners }))
    })

    // A stored row the rule could not settle against itself (two keyless owners alike) is not put back
    // over and over.
    it('does not keep putting back a paid row stored with two keyless owners alike', async () => {
      entryOpen()
      const alike = { email: 'owner@example.com', name: 'Owner Name' }
      const saved: Registration = {
        ...registrationWithStaticDates,
        owner: { ...alike, membership: false },
        // Rows stored before the owner list had keys; the browser model always has them.
        owners: JSON.parse(
          JSON.stringify([
            { ...alike, membership: false },
            { ...alike, membership: true },
          ])
        ),
      }
      const onChange = vi.fn()
      render(<Draft onChange={onChange} saved={saved} />, { wrapper: Wrapper })
      await flushPromises()

      expect(onChange).not.toHaveBeenCalled()
    })

    // The picking arrives by the WebSocket while the participant has the days and the dog changed.
    it('puts the locked sections of the draft back when the entry is picked mid-edit', async () => {
      entryOpen()
      const saved = unpaidRegistrationWithStaticDates
      const draft: Registration = {
        ...saved,
        dates: [{ date: '2021-02-11', time: 'ip' }],
        dog: { ...saved.dog, name: 'Another dog' },
        notes: 'my notes',
      }
      const onChange = vi.fn()
      const { rerender } = render(
        <RegistrationForm
          event={eventWithStaticDates}
          registration={draft}
          savedRegistration={saved}
          onChange={onChange}
        />,
        { wrapper: Wrapper }
      )
      await flushPromises()
      expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ dates: saved.dates }))

      const pickedSaved = { ...saved, messagesSent: { picked: true } }
      rerender(
        <RegistrationForm
          event={eventWithStaticDates}
          registration={draft}
          savedRegistration={pickedSaved}
          onChange={onChange}
        />
      )
      await flushPromises()

      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ dates: saved.dates, dog: saved.dog, notes: 'my notes' })
      )
      // Picked, not paid: the place in the trial is why.
      expect(screen.getByRole('alert')).toHaveTextContent(
        'registration.lockedChange registration.lockedReason.picked registration.lockedSection.entry'
      )
    })
  })
})
