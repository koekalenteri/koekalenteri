import type { Registration } from '../../types'
import { render, screen } from '@testing-library/react'
import { useState } from 'react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import { frozenInstant } from '../../test-utils/freezeClock'
import { RegistrationFormWrapper, setUpRegistrationFormTests } from '../../test-utils/registrationForm'
import { createMatchMedia, flushPromises, renderWithUserEvents, runPendingTimers } from '../../test-utils/utils'
import RegistrationForm from './RegistrationForm'

vi.mock('../../api/dog')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('react-i18next', async () =>
  (await import('../../test-utils/registrationFormTranslation')).mockRegistrationFormTranslation()
)

/** A place, as the form's row holds it when the entry has been picked. */
const place = { date: eventWithStaticDates.startDate, key: 'place-ap', number: 1, time: 'ap' as const }

describe('RegistrationForm', () => {
  setUpRegistrationFormTests()

  // Each section's toggle button carries the section title as its accessible name (see
  // CollapsibleSection): the section content itself is covered by KOE-1318's own tests, so this
  // only checks the sections are all present and in the right order.
  const sectionTitles = () =>
    screen.getAllByRole('button', { name: /^registration\.\w+$/ }).map((el) => el.getAttribute('aria-label'))

  it('renders', async () => {
    render(<RegistrationForm event={eventWithStaticDates} registration={registrationWithStaticDates} />, {
      wrapper: RegistrationFormWrapper,
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

  // KOE-1721: the team section follows the class, only where the event asks for a team at entry.
  it('asks for the team after the class where the event asks for one', async () => {
    render(
      <RegistrationForm
        event={{ ...eventWithStaticDates, teamCompetition: { askAtEntry: true } }}
        registration={registrationWithStaticDates}
      />,
      { wrapper: RegistrationFormWrapper }
    )
    await flushPromises()

    expect(sectionTitles().slice(0, 3)).toEqual(['registration.class', 'registration.teamEntry', 'registration.dog'])
  })

  it('renders with invalid dog information', async () => {
    render(
      <RegistrationForm
        event={eventWithStaticDates}
        // @ts-expect-error Type 'undefined' is not assignable to type 'Dog'.ts(2322)
        registration={{ ...registrationWithStaticDates, dog: undefined }}
      />,
      { wrapper: RegistrationFormWrapper }
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
      { wrapper: RegistrationFormWrapper }
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
        wrapper: RegistrationFormWrapper,
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
          { wrapper: RegistrationFormWrapper },
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
    render(<RegistrationForm event={eventWithStaticDates} registration={registration} />, {
      wrapper: RegistrationFormWrapper,
    })
    await flushPromises()

    expect(sectionTitles()).toContain('registration.dog')
    expect(screen.getAllByText(/validation\.registration\.dogAge/).length).toBeGreaterThan(0)
  })

  describe('the team named at entry (KOE-1721)', () => {
    // Before the trial, so the entry is still the registrant's to change.
    beforeEach(() => vi.setSystemTime(frozenInstant('2021-01-01')))
    afterEach(() => vi.setSystemTime(vi.getRealSystemTime()))

    it('names the team as typed, and leaves the entry without a team once the name is cleared', async () => {
      let changed: object = {}
      const onChange = vi.fn((registration: object) => {
        changed = registration
      })
      const { user } = renderWithUserEvents(
        <RegistrationForm
          event={{ ...eventWithStaticDates, teamCompetition: { askAtEntry: true } }}
          registration={{ ...registrationWithStaticDates, teamEntry: { name: 'Golden Ring' } }}
          onChange={onChange}
        />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await user.clear(screen.getByRole('textbox', { name: 'registration.teamEntryName' }))
      await flushPromises()

      // The key goes, not only its value, so the save sends the team's removal.
      expect(onChange).toHaveBeenCalled()
      expect(Object.hasOwn(changed, 'teamEntry')).toBe(false)
    })

    // The form keeps what it is given, as the edit page does, so a tick shows on the next change.
    const StatefulForm = ({
      initial,
      onChange,
    }: {
      readonly initial: Registration
      readonly onChange: (registration: Registration) => void
    }) => {
      const [registration, setRegistration] = useState(initial)
      return (
        <RegistrationForm
          event={{ ...eventWithStaticDates, teamCompetition: { askAtEntry: true } }}
          registration={registration}
          onChange={(changed) => {
            setRegistration(changed)
            onChange(changed)
          }}
        />
      )
    }

    it('takes the first-team mark off as it put it on, and keeps it through a rename', async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(
        <StatefulForm
          initial={{ ...registrationWithStaticDates, teamEntry: { name: 'Golden Ring' } }}
          onChange={onChange}
        />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()
      const primary = () => screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' })

      await user.click(primary())
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamEntry: { name: 'Golden Ring', primary: true } })
      )

      await user.click(primary())
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ teamEntry: { name: 'Golden Ring' } }))

      await user.click(primary())
      await user.type(screen.getByRole('textbox', { name: 'registration.teamEntryName' }), ' 2')
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ teamEntry: { name: 'Golden Ring 2', primary: true } })
      )
    })

    it('shows a team the entry already names where the trial no longer asks for one', async () => {
      render(
        <RegistrationForm
          event={eventWithStaticDates}
          registration={{ ...registrationWithStaticDates, teamEntry: { name: 'Golden Ring' } }}
        />,
        { wrapper: RegistrationFormWrapper }
      )
      await flushPromises()

      expect(sectionTitles()).toContain('registration.teamEntry')
      expect(screen.getByRole('textbox', { name: 'registration.teamEntryName' })).toHaveValue('Golden Ring')
    })

    it('leaves the team as it is while the entry is locked or the form is disabled', async () => {
      // The trial is past: the entry's details are no longer the registrant's to change.
      vi.setSystemTime(vi.getRealSystemTime())
      const onChange = vi.fn()
      const registration = { ...registrationWithStaticDates, teamEntry: { name: 'Golden Ring' } }
      const event = { ...eventWithStaticDates, teamCompetition: { askAtEntry: true } }
      const { rerender } = render(<RegistrationForm event={event} registration={registration} onChange={onChange} />, {
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()

      expect(screen.getByRole('textbox', { name: 'registration.teamEntryName' })).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: 'registration.teamEntryPrimary' })).toBeDisabled()

      vi.setSystemTime(frozenInstant('2021-01-01'))
      rerender(<RegistrationForm disabled event={event} registration={registration} onChange={onChange} />)
      await flushPromises()

      expect(screen.getByRole('textbox', { name: 'registration.teamEntryName' })).toBeDisabled()
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  it('should call onChange', async () => {
    const registration = { ...registrationWithStaticDates }

    const onChange = vi.fn().mockImplementation((props) => Object.assign(registration, props))

    const { user } = renderWithUserEvents(
      <RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />,
      { wrapper: RegistrationFormWrapper },
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

  // Unpaid: once paid the stored selection stands (KOE-1588). For an unset selection writing the default is
  // no change in meaning; remapping a key that names nobody would change who handles.
  it('should normalize undefined owner role flags to booleans', async () => {
    const registration = {
      ...unpaidRegistrationWithStaticDates,
      ownerHandles: undefined,
      ownerPays: undefined,
    }

    const onChange = vi.fn().mockImplementation((props) => Object.assign(registration, props))

    render(<RegistrationForm event={eventWithStaticDates} registration={registration} onChange={onChange} />, {
      wrapper: RegistrationFormWrapper,
    })

    await flushPromises()

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ ownerHandles: true, ownerPays: true }))
    expect(registration.ownerHandles).toBe(true)
    expect(registration.ownerPays).toBe(true)
  })

  // KOE-1598: an unset selection is the owner handling and paying, so the separate handler and payer
  // sections stay shut even while the selection is still unset.
  it('should keep the handler and payer sections shut for an unset owner selection', async () => {
    const registration = { ...registrationWithStaticDates, ownerHandles: undefined, ownerPays: undefined }

    render(<RegistrationForm event={eventWithStaticDates} registration={registration} onChange={vi.fn()} />, {
      wrapper: RegistrationFormWrapper,
    })
    await flushPromises()

    for (const title of ['registration.handler', 'registration.payer']) {
      expect(screen.getByText(title).closest('.MuiCollapse-root')).toHaveClass('MuiCollapse-hidden')
    }
  })

  // On a small screen a toggle sets every section's open state: the handler and payer sections are
  // held open behind their hidden Collapse while an owner handles and pays, unset included, so they
  // show open the moment someone else is chosen.
  it('should keep the handler and payer sections hidden when another section is toggled with an unset selection', async () => {
    window.matchMedia = createMatchMedia(400)
    try {
      const registration = { ...registrationWithStaticDates, ownerHandles: undefined, ownerPays: undefined }
      const { user } = renderWithUserEvents(
        <RegistrationForm event={eventWithStaticDates} registration={registration} onChange={vi.fn()} />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'registration.class' }))
      await runPendingTimers()

      for (const section of ['handler', 'payer']) {
        expect(screen.getByText(`registration.${section}`).closest('.MuiCollapse-root')).toHaveClass(
          'MuiCollapse-hidden'
        )
        expect(document.getElementById(`${section}_name`)?.closest('.MuiCollapse-root')).not.toHaveClass(
          'MuiCollapse-hidden'
        )
      }
    } finally {
      window.matchMedia = createMatchMedia(window.innerWidth)
    }
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
      { wrapper: RegistrationFormWrapper },
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
    const { rerender } = render(<RegistrationForm event={event} registration={paid} />, {
      wrapper: RegistrationFormWrapper,
    })
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
    const { rerender } = render(<RegistrationForm event={event} registration={saved} />, {
      wrapper: RegistrationFormWrapper,
    })
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
        wrapper: RegistrationFormWrapper,
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
      [
        'a payment charged twice',
        paymentPictureWith({ due: 0, standing: false, status: 'duplicate' }),
        { paymentStatus: 'DUPLICATE' as const },
        atOnce('0,00'),
      ],
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
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()

      expect(screen.getByText(/^registration\.paymentToBePaid/)).toHaveTextContent(text)
    })
  })

  it('says a new entry pays once its place is confirmed when the trial is paid at confirmation', async () => {
    const event = { ...eventWithStaticDates, paymentTime: 'confirmation' as const }
    const { group: _group, ...entry } = { ...unpaidRegistrationWithStaticDates, id: '' }
    render(<RegistrationForm event={event} registration={entry} />, { wrapper: RegistrationFormWrapper })
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
      wrapper: RegistrationFormWrapper,
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
      { wrapper: RegistrationFormWrapper },
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
        { wrapper: RegistrationFormWrapper }
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
        { wrapper: RegistrationFormWrapper }
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
        { wrapper: RegistrationFormWrapper }
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
        { wrapper: RegistrationFormWrapper }
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
        { wrapper: RegistrationFormWrapper }
      )
      await flushPromises()

      expect(screen.queryByText(/validation\.registration\.restrictedTo/)).not.toBeInTheDocument()
      expect(screen.queryByTestId('missing-info')).not.toBeInTheDocument()
    })
  })
})
