import type { LockableRegistration, ParticipantFieldLocks, ParticipantLockSection } from './registrationLocks'
import { eventWithStaticDates } from '../__mockData__/events'
import { frozenInstant } from '../test-utils/freezeClock'
import { addDays } from './day'
import { PUBLIC_REGISTRATION_FIELDS } from './registration'
import {
  getParticipantFieldLocks,
  isEntryRestrictionLocked,
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

  describe('isEntryRestrictionLocked', () => {
    const picked = { ...NO_PARTICIPANT_FIELD_LOCKS, dog: true, entry: true, people: true, results: true }
    const paid = { ...NO_PARTICIPANT_FIELD_LOCKS, dog: true, membership: true, payment: true }

    it.each([
      ['a breed restriction once the dog is locked', ['122'], picked, true],
      ['a breed restriction while the dog is open', ['122'], NO_PARTICIPANT_FIELD_LOCKS, false],
      ['a members-only restriction while the memberships are open', ['member'], picked, false],
      ['a members-only restriction once paid', ['member'], paid, true],
      ['members or a breed while the memberships are open', ['member', '122'], picked, false],
      ['members or a breed once paid', ['member', '122'], paid, true],
      ['a value that restricts nothing', ['invited'], NO_PARTICIPANT_FIELD_LOCKS, true],
    ] as const)('answers %s with %s', (_label, restrictions, locks, expected) => {
      expect(isEntryRestrictionLocked({ restrictions: [...restrictions] }, locks)).toBe(expected)
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
      const data = { ...base, dates: [...(base.dates ?? [])].reverse() }

      expect(participantLockedChange(ALL_LOCKED, base, data)).toBeUndefined()
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
      const newOwner = { email: 'new@example.com', key: 'b', name: 'New Owner' }

      it.each<[string, Partial<Entry>, ParticipantLockSection | undefined]>([
        ['an owner keeps theirs', { owners: [first] }, undefined],
        ['an owner flips theirs', { owners: [{ ...first, membership: false }] }, 'membership'],
        ['an added owner is no member', { owners: [first, { ...newOwner, membership: false }] }, undefined],
        ['an added owner is a member', { owners: [first, { ...newOwner, membership: true }] }, 'membership'],
        [
          'a member owner is swapped for one who is no member',
          { owners: [{ ...newOwner, membership: false }] },
          'membership',
        ],
        ['the separate handler flips theirs', { handler: { ...handler, membership: true } }, 'membership'],
      ])('%s', (_label, change, expected) => {
        expect(participantLockedChange(only('membership'), stored, { ...stored, ...change })).toBe(expected)
      })

      // Removing a member would change the price after paying and the restriction it met.
      it.each<[string, number, ParticipantLockSection | undefined]>([
        ['a member owner', 0, 'membership'],
        ['an owner who is no member', 1, undefined],
      ])('answers removing %s', (_label, removed, expected) => {
        const two: Entry = {
          ...base,
          owners: [
            { ...owner, key: 'a', membership: true },
            { ...owner, key: 'b', membership: false, name: 'Two' },
          ],
        }
        const owners = two.owners?.filter((_o, index) => index !== removed)

        expect(participantLockedChange(only('membership'), two, { ...two, owners })).toBe(expected)
      })

      // A row stored without a selection counts the handler's membership, as `isMember` reads it.
      describe('a row stored without an owner selection', () => {
        const legacy = (handlerMember: boolean): Entry => {
          const { ownerHandles: _h, ...rest } = base
          return { ...rest, handler: { ...handler, membership: handlerMember } }
        }

        it.each<[string, boolean, Partial<Entry>, ParticipantLockSection | undefined]>([
          ['its handler becomes a member', false, { handler: { ...handler, membership: true } }, 'membership'],
          ['the default selection is written, the handler no member', false, { ownerHandles: true }, undefined],
          ['the default selection drops a member handler', true, { ownerHandles: true }, 'membership'],
        ])('answers when %s', (_label, handlerMember, change, expected) => {
          const stored = legacy(handlerMember)

          expect(participantLockedChange(only('membership'), stored, { ...stored, ...change })).toBe(expected)
        })
      })

      it('lets a member co-owner leave while another member remains', () => {
        const two: Entry = {
          ...base,
          owners: [
            { ...owner, key: 'a', membership: true },
            { ...owner, key: 'b', membership: true, name: 'Two' },
          ],
        }

        expect(participantLockedChange(only('membership'), two, { ...two, owners: two.owners?.slice(1) })).toBe(
          undefined
        )
      })

      // A keyless stored owner is found by the key the form gives by position, or by who they are.
      describe('keyless stored owners', () => {
        const keyless: Entry = {
          ...base,
          owners: [
            { ...owner, membership: false, name: 'One' },
            { ...owner, email: 'two@example.com', membership: true, name: 'Two' },
          ],
        }
        const [one, two] = keyless.owners ?? []

        it.each<[string, Person[]]>([
          ['the first removed, sent without keys', [two]],
          ['the first removed in the form, which keys them by position', [{ ...two, key: 'owner-2' }]],
          ['the owners reordered, sent without keys', [two, one]],
        ])('finds no change when %s', (_label, owners) => {
          expect(participantLockedChange(only('membership'), keyless, { ...keyless, owners })).toBeUndefined()
        })

        it('finds a flip of an owner sent without keys in another position', () => {
          const owners = [{ ...two, membership: false }, one]

          expect(participantLockedChange(only('membership'), keyless, { ...keyless, owners })).toBe('membership')
        })
      })

      // A separate handler who counts may claim only the stored handling person's membership.
      it.each<[string, Person, ParticipantLockSection | undefined]>([
        ['the stored handler keeps theirs', handler, undefined],
        ['a new handler claims none', { email: 'bob@example.com', membership: false, name: 'Bob' }, undefined],
        ['a new handler claims one', { email: 'bob@example.com', membership: true, name: 'Bob' }, 'membership'],
      ])('answers when %s', (_label, newHandler, expected) => {
        expect(participantLockedChange(only('membership'), base, { ...base, handler: newHandler })).toBe(expected)
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

    // The owner who handled was a member; the draft names Bob apart, who claims the owner's membership.
    it('gives a new handler no membership, and the owner who handled keeps theirs', () => {
      const memberOwner = { ...owner, key: 'a', membership: true }
      const stored: Entry = { ...base, handler: memberOwner, ownerHandles: 'a', owners: [memberOwner] }
      const bob = { email: 'bob@example.com', membership: true, name: 'Bob' }
      const draft: Entry = { ...stored, handler: bob, ownerHandles: false }

      const reset = withLockedSectionsFrom(stored, draft, only('membership'))

      expect(reset.handler).toEqual({ ...bob, membership: false })
      expect(reset.owners).toEqual([memberOwner])
      expect(participantLockedChange(only('membership'), stored, reset)).toBeUndefined()
    })

    it('gives the stored people back to a draft that removed a member', () => {
      const stored: Entry = {
        ...base,
        owners: [
          { ...owner, key: 'a', membership: true },
          { ...owner, key: 'b' },
        ],
      }
      const removed: Entry = { ...stored, notes: 'my notes', owners: [{ ...owner, key: 'b' }] }

      const reset = withLockedSectionsFrom(stored, removed, only('membership'))

      expect(participantLockedChange(only('membership'), stored, reset)).toBeUndefined()
      expect(reset).toEqual({ ...stored, notes: 'my notes' })
    })

    it('removes a locked field the stored entry does not have', () => {
      const { selectedCost: _cost, ...stored } = base

      expect(withLockedSectionsFrom(stored, draft, only('payment'))).not.toHaveProperty('selectedCost')
    })
  })
})
