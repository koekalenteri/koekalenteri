import type { LockableRegistration, ParticipantFieldLocks, ParticipantLockSection } from './registrationLocks'
import { eventWithStaticDates } from '../__mockData__/events'
import { frozenInstant } from '../test-utils/freezeClock'
import { addDays } from './day'
import { PUBLIC_REGISTRATION_FIELDS } from './registration'
import {
  getParticipantFieldLocks,
  isParticipantFieldLocked,
  NO_PARTICIPANT_FIELD_LOCKS,
  PARTICIPANT_FIELD_SECTIONS,
  participantLockedChange,
  withLockedSectionsFrom,
} from './registrationLocks'

type Person = { email?: string; key?: string; membership?: boolean; name?: string }

/** An entry as the sections read it, with people that have names and a field no section locks. */
type Entry = Omit<LockableRegistration, 'handler' | 'owner' | 'owners'> & {
  handler?: Person
  notes?: string
  owner?: Person
  owners?: Person[]
}

const ALL_LOCKED: ParticipantFieldLocks = {
  dog: true,
  entry: true,
  membership: true,
  payment: true,
  people: true,
  results: true,
}
const only = (section: ParticipantLockSection): ParticipantFieldLocks => ({
  ...NO_PARTICIPANT_FIELD_LOCKS,
  [section]: true,
})

const owner = { email: 'owner@example.com', membership: false, name: 'Owner Name' }
const handler = { email: 'handler@example.com', membership: false, name: 'Handler Name' }
const base: Entry = {
  agreeToTerms: true,
  breeder: { name: 'Breeder Name' },
  class: 'ALO',
  dates: [
    { date: '2021-02-10', time: 'ap' },
    { date: '2021-02-11', time: 'ap' },
  ],
  dog: { dob: '2020-04-02', results: [] },
  handler,
  notes: 'notes',
  optionalCosts: [0, 1],
  owner,
  ownerHandles: false,
  ownerPays: true,
  reserve: 'ANY',
  results: [],
  selectedCost: 'normal',
}

/** A value each lockable public field could be changed to. A new lockable field needs one here. */
const CHANGED: Record<string, unknown> = {
  agreeToTerms: false,
  breeder: { name: 'Another breeder' },
  class: 'AVO',
  dates: [{ date: '2021-02-11', time: 'ip' }],
  dog: { ...base.dog, name: 'Another dog' },
  handler: { ...handler, name: 'Another handler' },
  optionalCosts: [1],
  owner: { ...owner, name: 'Another owner' },
  ownerHandles: true,
  ownerPays: false,
  owners: [{ ...owner, key: 'owner-1', name: 'Another owner' }],
  reserve: 'DAY',
  results: [{ date: '2020-08-01' }],
  selectedCost: 'custom',
}

const lockedFields = Object.entries(PARTICIPANT_FIELD_SECTIONS).flatMap(([field, section]) =>
  section === 'free' ? [] : [[field, section] as const]
)
const freeFields = Object.entries(PARTICIPANT_FIELD_SECTIONS)
  .filter(([, section]) => section === 'free')
  .map(([field]) => field)

describe('registrationLocks', () => {
  describe('PARTICIPANT_FIELD_SECTIONS', () => {
    it('places every field a participant may write', () => {
      expect(Object.keys(PARTICIPANT_FIELD_SECTIONS).sort()).toEqual([...PUBLIC_REGISTRATION_FIELDS].sort())
    })

    // A field placed in a section is one its comparison reads, so a lock cannot be named and not held.
    it.each(lockedFields)('compares %s in the %s section', (field, section) => {
      expect(CHANGED).toHaveProperty(field)
      const data: Entry = { ...base, [field]: CHANGED[field] }

      expect(participantLockedChange(only(section), base, data)).toBe(section)
      expect(participantLockedChange({ ...ALL_LOCKED, [section]: false }, base, data)).toBeUndefined()
    })

    it.each(freeFields)('leaves %s free', (field) => {
      expect(isParticipantFieldLocked(ALL_LOCKED, field)).toBe(false)
    })
  })

  describe('getParticipantFieldLocks', () => {
    const entryOpen = new Date(frozenInstant(eventWithStaticDates.entryStartDate))
    const betweenEntryAndTrial = new Date(frozenInstant(addDays(eventWithStaticDates.entryEndDate, 1)))
    const trialDay = new Date(frozenInstant(eventWithStaticDates.startDate))

    it.each([
      ['a new entry while the entry is open', {}, entryOpen, NO_PARTICIPANT_FIELD_LOCKS],
      ['an entry once the entry has closed', {}, betweenEntryAndTrial, only('entry')],
      ['an entry on a trial day', {}, trialDay, only('entry')],
      [
        'a picked entry',
        { messagesSent: { picked: true } },
        entryOpen,
        { ...NO_PARTICIPANT_FIELD_LOCKS, dog: true, entry: true, people: true, results: true },
      ],
      [
        'a paid entry',
        { paidAt: '2021-02-01T10:00:00.000Z' },
        entryOpen,
        { ...NO_PARTICIPANT_FIELD_LOCKS, dog: true, membership: true, payment: true },
      ],
      [
        'a picked and paid entry on a trial day',
        { messagesSent: { picked: true }, paidAt: new Date() },
        trialDay,
        ALL_LOCKED,
      ],
    ] as const)('locks %s', (_label, stored, now, expected) => {
      expect(getParticipantFieldLocks(eventWithStaticDates, stored, now)).toEqual(expected)
    })

    it('locks nothing of a missing registration while the entry is open', () => {
      expect(getParticipantFieldLocks(eventWithStaticDates, undefined, entryOpen)).toEqual(NO_PARTICIPANT_FIELD_LOCKS)
    })
  })

  describe('isParticipantFieldLocked', () => {
    it.each([
      ['class', only('entry'), true],
      ['owner', only('people'), true],
      ['owner', only('membership'), false],
      ['notes', ALL_LOCKED, false],
      ['qualifies', ALL_LOCKED, false],
    ] as const)('answers %s with %s', (field, locks, expected) => {
      expect(isParticipantFieldLocked(locks, field)).toBe(expected)
    })
  })

  describe('participantLockedChange', () => {
    it('finds no change in an identical copy', () => {
      expect(participantLockedChange(ALL_LOCKED, base, structuredClone(base))).toBeUndefined()
    })

    it('compares the days as a set', () => {
      expect(participantLockedChange(ALL_LOCKED, base, { ...base, dates: [...(base.dates ?? [])].reverse() })).toBe(
        undefined
      )
    })

    it('compares the optional costs as a set', () => {
      expect(participantLockedChange(ALL_LOCKED, base, { ...base, optionalCosts: [1, 0] })).toBeUndefined()
    })

    it('leaves the official results to the server', () => {
      const data = { ...base, dog: { ...base.dog, results: [{ date: '2020-08-01' as const }] } }

      expect(participantLockedChange(ALL_LOCKED, base, data)).toBeUndefined()
    })

    it('reads an unset owner selection as the first owner', () => {
      const { ownerHandles: _h, ownerPays: _p, ...stored } = { ...base, ownerHandles: true }
      const data = { ...stored, ownerHandles: true, ownerPays: 'owner-1' }

      expect(participantLockedChange(ALL_LOCKED, stored, data)).toBeUndefined()
    })

    it('reads an unset selection as the owner handling, so the handler is the copy', () => {
      const { ownerHandles: _h, ...stored } = base
      const data = { ...stored, handler: { ...handler, name: 'Copy of the owner' } }

      expect(participantLockedChange(ALL_LOCKED, stored, data)).toBeUndefined()
    })

    it('ignores the handler while an owner handles, as the server copies the owner there', () => {
      const stored = { ...base, ownerHandles: true }
      const data = { ...stored, handler: { ...handler, name: 'Copy of the owner' } }

      expect(participantLockedChange(ALL_LOCKED, stored, data)).toBeUndefined()
    })

    it('ignores the keys the form gives keyless owners', () => {
      const stored = { ...base, owners: [owner, { ...owner, name: 'Two' }] }
      const data = { ...stored, owners: stored.owners.map((o, index) => ({ ...o, key: `owner-${index + 1}` })) }

      expect(participantLockedChange(ALL_LOCKED, stored, data)).toBeUndefined()
    })

    describe('membership', () => {
      const stored: Entry = { ...base, owners: [{ ...owner, key: 'a', membership: true }] }
      const [first] = stored.owners ?? []

      it.each<[string, Partial<Entry>, ParticipantLockSection | undefined]>([
        ['an owner keeps theirs', { owners: [first] }, undefined],
        ['an owner flips theirs', { owners: [{ ...first, membership: false }] }, 'membership'],
        ['an added owner is no member', { owners: [first, { ...owner, key: 'b', membership: false }] }, undefined],
        ['an added owner is a member', { owners: [first, { ...owner, key: 'b', membership: true }] }, 'membership'],
        ['an owner is removed', { owners: [{ ...owner, key: 'b', membership: false }] }, undefined],
        ['the separate handler flips theirs', { handler: { ...handler, membership: true } }, 'membership'],
      ])('%s', (_label, change, expected) => {
        expect(participantLockedChange(only('membership'), stored, { ...stored, ...change })).toBe(expected)
      })

      it('reads keyless stored owners by position', () => {
        const keyless: Entry = { ...base, owners: [owner, { ...owner, membership: true, name: 'Two' }] }
        const keyed = keyless.owners?.map((o, index) => ({ ...o, key: `owner-${index + 1}` }))
        const flipped = keyed?.map((o) => ({ ...o, membership: !o.membership }))

        expect(participantLockedChange(only('membership'), keyless, { ...keyless, owners: keyed })).toBeUndefined()
        expect(participantLockedChange(only('membership'), keyless, { ...keyless, owners: flipped })).toBe('membership')
      })

      it.each([
        ['the handling owner was a member and the copy says so', true, true, undefined],
        ['the handling owner was a member and the handler is not', true, false, 'membership'],
        ['the handling owner was no member and the handler is', false, true, 'membership'],
      ] as const)('a handler named apart: %s', (_label, ownerMember, handlerMember, expected) => {
        const handlingOwner = { ...owner, key: 'a', membership: ownerMember }
        const handledByOwner: Entry = { ...base, handler: handlingOwner, ownerHandles: true, owners: [handlingOwner] }
        const data = {
          ...handledByOwner,
          handler: { ...handlingOwner, membership: handlerMember },
          ownerHandles: false,
        }

        expect(participantLockedChange(only('membership'), handledByOwner, data)).toBe(expected)
      })
    })
  })

  describe('withLockedSectionsFrom', () => {
    const draft: Entry = {
      ...base,
      class: 'AVO',
      dates: [{ date: '2021-02-11', time: 'ip' }],
      dog: { ...base.dog, dob: '2020-05-01' },
      handler: { ...handler, membership: true },
      notes: 'my notes',
      owner: { ...owner, name: 'Another owner' },
      owners: [
        { ...owner, key: 'owner-1', membership: true, name: 'Another owner' },
        { ...owner, key: 'b', membership: true, name: 'New' },
      ],
      selectedCost: 'custom',
    }

    it('puts back every locked section and keeps what is free', () => {
      const reset = withLockedSectionsFrom(base, draft, ALL_LOCKED)

      expect(participantLockedChange(ALL_LOCKED, base, reset)).toBeUndefined()
      expect(reset.notes).toBe('my notes')
    })

    it('keeps the sections that are open', () => {
      expect(withLockedSectionsFrom(base, draft, only('entry'))).toEqual({
        ...draft,
        class: base.class,
        dates: base.dates,
        reserve: base.reserve,
      })
    })

    it('puts back only the memberships while the people are open', () => {
      const reset = withLockedSectionsFrom(base, draft, only('membership'))

      expect(participantLockedChange(only('membership'), base, reset)).toBeUndefined()
      expect(reset.owners).toEqual([
        { ...draft.owners?.[0], membership: false },
        { ...draft.owners?.[1], membership: false },
      ])
      expect(reset.owner).toEqual({ ...draft.owner, membership: false })
      expect(reset.handler).toEqual({ ...draft.handler, membership: false })
    })

    it('removes a locked field the stored entry does not have', () => {
      const { selectedCost: _cost, ...stored } = base

      expect(withLockedSectionsFrom(stored, draft, only('payment'))).not.toHaveProperty('selectedCost')
    })
  })
})
