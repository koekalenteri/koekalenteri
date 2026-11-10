import type { Registration } from '../../types'
import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import { frozenInstant } from '../../test-utils/freezeClock'
import { RegistrationFormWrapper, setUpRegistrationFormTests } from '../../test-utils/registrationForm'
import { flushPromises, renderWithUserEvents, runPendingTimers } from '../../test-utils/utils'
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

describe('RegistrationForm', () => {
  setUpRegistrationFormTests()

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
      render(<RegistrationForm event={eventWithStaticDates} registration={picked} />, {
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()

      expect(regNoField()).toBeDisabled()
      expect(notesField()).toBeEnabled()
    })

    it('locks the class and the days of a reserve entrant on a trial day', async () => {
      trialDay()
      render(<RegistrationForm event={eventWithStaticDates} registration={reserveEntrant} />, {
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()

      expect(reserveField()).toBeDisabled()
      expect(regNoField()).toBeEnabled()
    })

    it('leaves the class and the days of a reserve entrant open while the entry is open', async () => {
      entryOpen()
      render(<RegistrationForm event={eventWithStaticDates} registration={reserveEntrant} />, {
        wrapper: RegistrationFormWrapper,
      })
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
        { wrapper: RegistrationFormWrapper }
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
        { wrapper: RegistrationFormWrapper }
      )
      await flushPromises()

      if (saves) expect(saveButton()).toBeEnabled()
      else expect(saveButton()).toBeDisabled()
    })

    it('keeps every section open for the secretary on a picked and paid entry', async () => {
      trialDay()
      const registration: Registration = { ...registrationWithStaticDates, messagesSent: { picked: true } }
      render(<RegistrationForm admin event={eventWithStaticDates} registration={registration} />, {
        wrapper: RegistrationFormWrapper,
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
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()

      expect(saveButton()).toBeDisabled()
      const missing = within(screen.getByTestId('missing-info')).getAllByRole('listitem', { hidden: true })
      expect(missing.map((item) => item.textContent?.trim())).toEqual(['registration.payer defaultValue'])
    })

    // The form writes the first owner into an unset selection; a picked or paid entry's stands as stored.
    // For an unset selection that is no change in meaning; remapping a key that names nobody would
    // change who handles.
    it.each([
      ['a picked entry', () => picked],
      ['a paid entry not yet picked', () => registrationWithStaticDates],
    ])('leaves the unset owner selections of %s as they are', async (_label, entry) => {
      entryOpen()
      const { ownerHandles: _h, ownerPays: _p, ...stored } = entry()
      const onChange = vi.fn()
      render(<RegistrationForm event={eventWithStaticDates} registration={stored} onChange={onChange} />, {
        wrapper: RegistrationFormWrapper,
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
        wrapper: RegistrationFormWrapper,
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
        { wrapper: RegistrationFormWrapper }
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
          { wrapper: RegistrationFormWrapper },
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
        { wrapper: RegistrationFormWrapper },
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
        { wrapper: RegistrationFormWrapper }
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
        { wrapper: RegistrationFormWrapper }
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
      render(<Draft onChange={onChange} saved={saved} />, { wrapper: RegistrationFormWrapper })
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
        { wrapper: RegistrationFormWrapper }
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
