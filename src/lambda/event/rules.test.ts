import type { JsonRegistration, RegistrationClass } from '../../types'
import {
  buildEventPatch,
  calculateClassAggregates,
  calculateEventAggregates,
  filterCountableRegistrations,
  hasAggregateChanges,
} from './rules'
import { createEvent } from './testUtils'

// ---------------------------------------------------------------------------
// Minimal registration builder for aggregate tests
// ---------------------------------------------------------------------------

const createReg = (overrides: Partial<JsonRegistration> = {}): JsonRegistration =>
  ({
    cancelled: false,
    class: 'ALO',
    eventId: 'event123',
    id: 'reg1',
    state: 'ready',
    ...overrides,
  }) as unknown as JsonRegistration

describe('buildEventPatch', () => {
  it('returns a no-op patch when intended values match existing values', () => {
    const existing = createEvent()

    expect(
      buildEventPatch(existing.id, existing, {
        name: existing.name,
        places: existing.places,
      })
    ).toEqual({ eventId: existing.id })
  })

  it('includes changed fields in set', () => {
    const existing = createEvent()

    expect(
      buildEventPatch(existing.id, existing, {
        name: 'Updated Event',
        places: 25,
      })
    ).toEqual({
      eventId: existing.id,
      set: {
        name: 'Updated Event',
        places: 25,
      },
    })
  })

  it('includes removed fields in remove when intended value is undefined', () => {
    const existing = createEvent({ qualificationStartDate: '2024-10-01' })

    expect(buildEventPatch(existing.id, existing, { qualificationStartDate: undefined })).toEqual({
      eventId: existing.id,
      remove: ['qualificationStartDate'],
    })
  })

  it('includes derived fields in patch output', () => {
    const existing = createEvent({ entryOrigEndDate: undefined, season: '2024', startDate: '2024-12-31' })

    expect(
      buildEventPatch(existing.id, existing, {
        entryOrigEndDate: '2025-01-01',
        season: '2025',
      })
    ).toEqual({
      eventId: existing.id,
      set: {
        entryOrigEndDate: '2025-01-01',
        season: '2025',
      },
    })
  })

  it('includes both set and remove operations in a single patch when needed', () => {
    const existing = createEvent({ name: 'Old', qualificationStartDate: '2024-10-01' })

    expect(
      buildEventPatch(existing.id, existing, {
        name: 'New',
        qualificationStartDate: undefined,
      })
    ).toEqual({
      eventId: existing.id,
      remove: ['qualificationStartDate'],
      set: { name: 'New' },
    })
  })
})

// ---------------------------------------------------------------------------
// filterCountableRegistrations
// ---------------------------------------------------------------------------

describe('filterCountableRegistrations', () => {
  it('includes ready non-cancelled registrations', () => {
    const reg = createReg({ cancelled: false, state: 'ready' })
    expect(filterCountableRegistrations([reg])).toEqual([reg])
  })

  it('excludes cancelled registrations', () => {
    const reg = createReg({ cancelled: true, state: 'ready' })
    expect(filterCountableRegistrations([reg])).toEqual([])
  })

  it('excludes non-ready registrations', () => {
    const pending = createReg({ state: 'pending' as any })
    const draft = createReg({ state: 'draft' as any })
    expect(filterCountableRegistrations([pending, draft])).toEqual([])
  })

  it('returns empty list for empty input', () => {
    expect(filterCountableRegistrations([])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// calculateClassAggregates
// ---------------------------------------------------------------------------

describe('calculateClassAggregates', () => {
  it('counts entries per class', () => {
    const event = createEvent({ classes: [{ class: 'ALO', date: '2025-01-01', entries: 0, members: 0 }] })
    const regs = [createReg({ class: 'ALO' }), createReg({ class: 'ALO', id: 'reg2' })]

    const { classes, classesChanged } = calculateClassAggregates(event, regs)

    expect(classes[0]?.entries).toBe(2)
    expect(classesChanged).toBe(true)
  })

  it('reports classesChanged false when counts are unchanged', () => {
    const event = createEvent({ classes: [{ class: 'ALO', date: '2025-01-01', entries: 1, members: 0 }] })
    const regs = [createReg({ class: 'ALO' })]

    const { classesChanged } = calculateClassAggregates(event, regs)

    expect(classesChanged).toBe(false)
  })

  it('returns zero counts for a class with no registrations', () => {
    const event = createEvent({ classes: [{ class: 'AVO', date: '2025-01-01', entries: 5, members: 3 }] })

    const { classes, classesChanged } = calculateClassAggregates(event, [])

    expect(classes[0]?.entries).toBe(0)
    expect(classes[0]?.members).toBe(0)
    expect(classesChanged).toBe(true)
  })

  it('does not mutate the original event classes', () => {
    const event = createEvent({ classes: [{ class: 'ALO', date: '2025-01-01', entries: 2, members: 1 }] })
    const originalClasses = [...event.classes]
    calculateClassAggregates(event, [])
    expect(event.classes).toEqual(originalClasses)
  })
})

// ---------------------------------------------------------------------------
// calculateEventAggregates
// ---------------------------------------------------------------------------

describe('calculateEventAggregates', () => {
  it('calculates entries and members across all classes', () => {
    const event = createEvent({
      classes: [
        { class: 'ALO', date: '2025-01-01', entries: 0, members: 0 },
        { class: 'AVO', date: '2025-01-01', entries: 0, members: 0 },
      ],
    })
    const regs = [
      createReg({ class: 'ALO', id: 'r1', state: 'ready' }),
      createReg({ class: 'ALO', id: 'r2', state: 'ready' }),
      createReg({ class: 'AVO', id: 'r3', state: 'ready' }),
      // Non-countable – should not appear in totals
      createReg({ cancelled: true, class: 'ALO', id: 'r4', state: 'ready' }),
      createReg({ class: 'ALO', id: 'r5', state: 'pending' as any }),
    ]

    const result = calculateEventAggregates(event, regs)

    expect(result.entries).toBe(3)
    // members depends on hasPriority; with no priority set they count as 0 members
    expect(typeof result.members).toBe('number')
    expect(result.classes).toHaveLength(2)
  })

  it('returns zero aggregates for empty registrations', () => {
    const event = createEvent({ classes: [{ class: 'ALO', date: '2025-01-01', entries: 5, members: 2 }] })

    const result = calculateEventAggregates(event, [])

    expect(result.entries).toBe(0)
    expect(result.members).toBe(0)
    expect(result.classes[0]?.entries).toBe(0)
    expect(result.classes[0]?.members).toBe(0)
  })

  it('returns class-level member counts when registrations have priority', () => {
    const event = createEvent({
      classes: [{ class: 'ALO', date: '2025-01-01', entries: 0, members: 0 }],
      priority: ['member'],
    })
    const regs = [createReg({ class: 'ALO', handler: { membership: true } as any, id: 'p1', state: 'ready' })]

    const result = calculateEventAggregates(event, regs)

    expect(result.entries).toBe(1)
    expect(result.members).toBe(1)
    expect(result.classes[0]?.members).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// hasAggregateChanges
// ---------------------------------------------------------------------------

describe('hasAggregateChanges', () => {
  it('returns false when entries, members and classes are unchanged', () => {
    const event = createEvent({
      classes: [{ class: 'ALO' as RegistrationClass, date: '2025-01-01', entries: 2, members: 1 }],
      entries: 2,
      members: 1,
    })
    const next = {
      classes: [{ class: 'ALO' as RegistrationClass, date: '2025-01-01', entries: 2, members: 1 }],
      entries: 2,
      members: 1,
    }
    expect(hasAggregateChanges(event, next)).toBe(false)
  })

  it('returns true when entries differ', () => {
    const event = createEvent({ classes: [], entries: 2, members: 1 })
    expect(hasAggregateChanges(event, { classes: [], entries: 3, members: 1 })).toBe(true)
  })

  it('returns true when members differ', () => {
    const event = createEvent({ classes: [], entries: 2, members: 1 })
    expect(hasAggregateChanges(event, { classes: [], entries: 2, members: 2 })).toBe(true)
  })

  it('returns true when class counts differ', () => {
    const event = createEvent({
      classes: [{ class: 'ALO' as RegistrationClass, date: '2025-01-01', entries: 2, members: 1 }],
      entries: 2,
      members: 1,
    })
    const next = {
      classes: [{ class: 'ALO' as RegistrationClass, date: '2025-01-01', entries: 3, members: 1 }],
      entries: 2,
      members: 1,
    }
    expect(hasAggregateChanges(event, next)).toBe(true)
  })

  it('returns true when class count differs', () => {
    const event = createEvent({ classes: [], entries: 0, members: 0 })
    const next = {
      classes: [{ class: 'ALO' as RegistrationClass, date: '2025-01-01', entries: 1, members: 0 }],
      entries: 1,
      members: 0,
    }
    expect(hasAggregateChanges(event, next)).toBe(true)
  })
})
