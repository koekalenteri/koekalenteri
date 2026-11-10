import type { Registration } from '../../types'
import { render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates, unpaidRegistrationWithStaticDates } from '../../__mockData__/registrations'
import * as dogApi from '../../api/dog'
import { frozenInstant } from '../../test-utils/freezeClock'
import { RegistrationFormWrapper, setUpRegistrationFormTests } from '../../test-utils/registrationForm'
import { describeInTimeZone } from '../../test-utils/timeZone'
import { flushPromises, renderWithUserEvents, runPendingTimers, typeDateKeyByKey } from '../../test-utils/utils'
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
        { wrapper: RegistrationFormWrapper },
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
            { wrapper: RegistrationFormWrapper },
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

  // After the trial the secretary may still fix what was typed of the dog, which the results send
  // needs; the rest of the entry stays as it is (KOE-1650). The file's clock is the real one, past the
  // trial's days.
  describe('after the trial (KOE-1650)', () => {
    /** The form as the edit dialog holds it: every change comes back as the next registration. */
    function AfterTrial({
      initial,
      onChange,
      onSave,
    }: {
      readonly initial: Registration
      readonly onChange?: (registration: Registration) => void
      readonly onSave: () => Promise<void>
    }) {
      const [registration, setRegistration] = useState(initial)
      return (
        <RegistrationForm
          admin
          changes={registration !== initial}
          event={eventWithStaticDates}
          onChange={(next) => {
            onChange?.(next)
            setRegistration(next)
          }}
          onSave={onSave}
          registration={registration}
          savedRegistration={initial}
          typedDogOnly
        />
      )
    }
    // The case of the issue: a dog entered by hand (GetDog never stamped it), its chip a registration
    // number's digits, and no rfidEditable, since it was stored before the flag was set for such a dog.
    const { refreshDate: _refreshDate, ...handEnteredDog } = registrationWithStaticDates.dog
    const handEntered: Registration = { ...registrationWithStaticDates, dog: { ...handEnteredDog, rfid: '623372020' } }
    const rfidField = () => screen.getByRole('textbox', { name: 'dog.rfid' })
    const saveButton = () => screen.getByRole('button', { name: 'registration.cta.saveChanges' })

    it("opens only a hand-entered dog's typed details and saves a fixed chip", async () => {
      const onSave = vi.fn(async () => undefined)
      const { user } = renderWithUserEvents(
        <AfterTrial initial={handEntered} onSave={onSave} />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      expect(rfidField()).toBeEnabled()
      expect(rfidField()).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('combobox', { name: 'dog.breed' })).toBeEnabled()
      expect(screen.getByRole('combobox', { name: 'dog.gender' })).toBeEnabled()
      expect(screen.getByRole('combobox', { name: 'dog.regNo' })).toBeEnabled()
      expect(screen.getByRole('textbox', { name: 'dog.name' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'registration.reserve' })).toBeDisabled()
      expect(screen.getByRole('textbox', { name: 'registration.notes' })).toBeDisabled()
      expect(saveButton()).toBeDisabled()

      await user.clear(rfidField())
      await user.type(rfidField(), '98512001234567')
      await runPendingTimers()
      await flushPromises()
      expect(saveButton()).toBeDisabled()

      await user.type(rfidField(), '8')
      await runPendingTimers()
      await flushPromises()
      expect(rfidField()).toHaveAttribute('aria-invalid', 'false')
      expect(saveButton()).toBeEnabled()

      await user.click(saveButton())
      expect(onSave).toHaveBeenCalledTimes(1)
    })

    it('changes nothing on opening an entry whose owner selection is unset', async () => {
      const onChange = vi.fn()
      const { ownerHandles: _handles, ownerPays: _pays, ...unset } = handEntered
      render(<AfterTrial initial={unset} onChange={onChange} onSave={async () => undefined} />, {
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()
      await runPendingTimers()

      expect(onChange).not.toHaveBeenCalled()
      expect(saveButton()).toBeDisabled()
    })

    // The judged entry's qualification is not the fix's to recompute or to wait on.
    it('saves a chip fix as the only change, on an entry that does not qualify', async () => {
      const onChange = vi.fn()
      const onSave = vi.fn(async () => undefined)
      const notQualifying: Registration = { ...handEntered, qualifies: false, qualifyingResults: [] }
      const { user } = renderWithUserEvents(
        <AfterTrial initial={notQualifying} onChange={onChange} onSave={onSave} />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await user.clear(rfidField())
      await user.type(rfidField(), '985120012345678')
      await runPendingTimers()
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({
        ...notQualifying,
        dog: { ...notQualifying.dog, rfid: '985120012345678' },
      })
      expect(saveButton()).toBeEnabled()
      await user.click(saveButton())
      expect(onSave).toHaveBeenCalledTimes(1)
    })

    it("opens the hand-entered dog's birth date and takes its sex", async () => {
      const onChange = vi.fn()
      const { user } = renderWithUserEvents(
        <AfterTrial initial={handEntered} onChange={onChange} onSave={async () => undefined} />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      expect(screen.getByRole('button', { name: /choose date/i })).toBeEnabled()

      await user.click(screen.getByRole('combobox', { name: 'dog.gender' }))
      await user.click(await screen.findByRole('option', { name: 'dog.genderChoises.F' }))
      await runPendingTimers()
      await flushPromises()

      expect(onChange).toHaveBeenLastCalledWith({ ...handEntered, dog: { ...handEntered.dog, gender: 'F' } })
    })

    it("takes the hand-entered dog's birth date and breed", async () => {
      const onChange = vi.fn()
      const noDob: Registration = { ...handEntered, dog: { ...handEntered.dog, dob: undefined } }
      const { user } = renderWithUserEvents(
        <AfterTrial initial={noDob} onChange={onChange} onSave={async () => undefined} />,
        { wrapper: RegistrationFormWrapper },
        { advanceTimers: vi.advanceTimersByTime }
      )
      await flushPromises()

      await typeDateKeyByKey(user, screen.getByRole('group', { name: 'dog.dob' }), '15032020')
      await runPendingTimers()
      expect(onChange).toHaveBeenLastCalledWith({ ...noDob, dog: { ...noDob.dog, dob: '2020-03-15' } })

      await user.click(screen.getByRole('combobox', { name: 'dog.breed' }))
      // The breeds are offered in a fixed order; the first is 122.
      const [first] = await screen.findAllByRole('option')
      await user.click(first)
      await runPendingTimers()
      await flushPromises()
      expect(onChange).toHaveBeenLastCalledWith({
        ...noDob,
        dog: { ...noDob.dog, breedCode: '122', dob: '2020-03-15' },
      })
    })

    // The number of a dog entered by hand is one of the typed details (KOE-1674). Only the number
    // changes: nothing is looked up, so no dog, people or results come along, and no cache is written.
    describe("a hand-entered dog's number (KOE-1674)", () => {
      const correctable: Registration = {
        ...registrationWithStaticDates,
        dog: { ...handEnteredDog, regNo: 'EST-03101/26', rfid: '985120012345678' },
      }
      const regNoField = () => screen.getByRole('combobox', { name: 'dog.regNo' })

      it('saves a corrected number as the only change, without a lookup', async () => {
        const getDog = vi.spyOn(dogApi, 'getDog')
        getDog.mockClear()
        const onChange = vi.fn()
        const onSave = vi.fn(async () => undefined)
        const { user } = renderWithUserEvents(
          <AfterTrial initial={correctable} onChange={onChange} onSave={onSave} />,
          { wrapper: RegistrationFormWrapper },
          { advanceTimers: vi.advanceTimersByTime }
        )
        await flushPromises()

        expect(regNoField()).toBeEnabled()
        await user.type(regNoField(), '{Backspace}5', { initialSelectionEnd: 12, initialSelectionStart: 12 })
        await runPendingTimers()
        await flushPromises()

        expect(regNoField()).toHaveValue('EST-03101/25')
        expect(regNoField()).toHaveAttribute('aria-invalid', 'false')
        expect(onChange).toHaveBeenLastCalledWith({
          ...correctable,
          dog: { ...correctable.dog, regNo: 'EST-03101/25' },
        })
        expect(getDog).not.toHaveBeenCalled()
        expect(JSON.parse(localStorage.getItem('dog-cache') ?? '{}')).not.toHaveProperty(['EST-03101/25'])
        // The button has no part in this: the dog stays typed, and the number is saved with the form.
        expect(screen.getByRole('button', { name: 'registration.cta.update' })).toBeDisabled()
        expect(screen.getByText(/registration\.cta\.helper\.typed/)).toBeInTheDocument()

        expect(saveButton()).toBeEnabled()
        await user.click(saveButton())
        expect(onSave).toHaveBeenCalledTimes(1)
      })

      it("refuses a number that is not in its registry's form, and takes the stored one back", async () => {
        const onChange = vi.fn()
        const { user } = renderWithUserEvents(
          <AfterTrial initial={correctable} onChange={onChange} onSave={async () => undefined} />,
          { wrapper: RegistrationFormWrapper },
          { advanceTimers: vi.advanceTimersByTime }
        )
        await flushPromises()

        // The hyphen out: "EST03101/26", which the loose lookup rule lets through.
        await user.type(regNoField(), '{Backspace}', { initialSelectionEnd: 4, initialSelectionStart: 4 })
        await flushPromises()
        expect(regNoField()).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText('validation.regNo.EST')).toBeInTheDocument()
        expect(saveButton()).toBeDisabled()

        await user.type(regNoField(), '-', { initialSelectionEnd: 3, initialSelectionStart: 3 })
        await flushPromises()
        expect(regNoField()).toHaveAttribute('aria-invalid', 'false')
        expect(screen.queryByText('validation.regNo.EST')).not.toBeInTheDocument()
        expect(onChange).toHaveBeenLastCalledWith(correctable)
      })

      it('refuses an emptied number and keeps the dog', async () => {
        const onChange = vi.fn()
        const { user } = renderWithUserEvents(
          <AfterTrial initial={correctable} onChange={onChange} onSave={async () => undefined} />,
          { wrapper: RegistrationFormWrapper },
          { advanceTimers: vi.advanceTimersByTime }
        )
        await flushPromises()

        await user.clear(regNoField())
        await runPendingTimers()
        await flushPromises()

        expect(onChange).toHaveBeenLastCalledWith({ ...correctable, dog: { ...correctable.dog, regNo: '' } })
        expect(regNoField()).toHaveAttribute('aria-invalid', 'true')
        expect(saveButton()).toBeDisabled()
      })

      // Select-all and retype is the usual way to correct a number. The sections that close on a missing
      // number read the stored entry here, and nothing but the number comes to the form.
      it('leaves the other sections as they are while the number is empty or half-typed', async () => {
        const before = localStorage.getItem('dog-cache')
        const { user } = renderWithUserEvents(
          <AfterTrial initial={correctable} onSave={async () => undefined} />,
          { wrapper: RegistrationFormWrapper },
          { advanceTimers: vi.advanceTimersByTime }
        )
        await flushPromises()
        const sectionsOpen = () => {
          expect(document.getElementById('breeder_name')?.closest('.MuiCollapse-entered')).not.toBeNull()
          expect(screen.queryByText(/validation\.registration\.choose/)).not.toBeInTheDocument()
        }
        sectionsOpen()

        await user.clear(regNoField())
        await runPendingTimers()
        await flushPromises()
        sectionsOpen()

        await user.type(regNoField(), 'EST-0')
        await runPendingTimers()
        await flushPromises()
        sectionsOpen()
        expect(saveButton()).toBeDisabled()
        expect(localStorage.getItem('dog-cache')).toBe(before)
      })

      it('stays locked once Kennelliitto may hold a result for it', async () => {
        const kcResult = {
          at: new Date('2026-11-04T10:00:00.000Z'),
          by: 'Sihteeri',
          payloadHash: 'h',
          status: 'sent' as const,
        }
        render(<AfterTrial initial={{ ...correctable, kcResult }} onSave={async () => undefined} />, {
          wrapper: RegistrationFormWrapper,
        })
        await flushPromises()

        expect(regNoField()).toBeDisabled()
        // The rest of a typed dog's details stay open.
        expect(rfidField()).toBeEnabled()
      })
    })

    // Only the typed details open after the trial: a Kennelliitto dog's missing birth date is not one,
    // and the results send never needs it.
    it("keeps a Kennelliitto dog's missing birth date locked", async () => {
      const noDob: Registration = {
        ...registrationWithStaticDates,
        dog: { ...registrationWithStaticDates.dog, dob: undefined },
      }
      render(<AfterTrial initial={noDob} onSave={async () => undefined} />, { wrapper: RegistrationFormWrapper })
      await flushPromises()

      expect(screen.getByRole('button', { name: /choose date/i })).toBeDisabled()
    })

    it("keeps a Kennelliitto dog's details locked", async () => {
      render(<AfterTrial initial={registrationWithStaticDates} onSave={async () => undefined} />, {
        wrapper: RegistrationFormWrapper,
      })
      await flushPromises()

      expect(rfidField()).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'dog.breed' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'dog.gender' })).toBeDisabled()
      expect(screen.getByRole('combobox', { name: 'dog.regNo' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'registration.cta.update' })).toBeDisabled()
    })
  })
})
