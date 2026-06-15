import { describe, expect, it } from '@jest/globals'
import { createPatch } from './patch'

describe('createPatch', () => {
  it('returns only changes for no-op patches', () => {
    const existing = { id: '1', name: 'Event' }

    expect(createPatch({ ...existing }, existing)).toEqual({ changes: {} })
  })

  it('creates set and remove operations for top-level fields', () => {
    const existing = { id: '1', name: 'Old', qualificationStartDate: '2024-01-01' }
    const next = { id: '1', name: 'New', qualificationStartDate: undefined }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        name: 'New',
        qualificationStartDate: undefined,
      },
      remove: ['qualificationStartDate'],
      set: { name: 'New' },
    })
  })

  it('treats null as a top-level field removal', () => {
    const existing = { id: '1', kcId: 123456, name: 'Event' }
    const next = { id: '1', kcId: null, name: 'Event' }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        kcId: null,
      },
      remove: ['kcId'],
    })
  })

  it('creates partial dotted set operations for nested object changes', () => {
    const existing = {
      contactInfo: {
        secretary: { email: 'old@example.com', name: 'Secretary' },
      },
      id: '1',
    }
    const next = {
      contactInfo: {
        secretary: { email: 'new@example.com', name: 'Secretary' },
      },
      id: '1',
    }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        contactInfo: {
          secretary: { email: 'new@example.com' },
        },
      },
      set: { 'contactInfo.secretary.email': 'new@example.com' },
    })
  })

  it('creates partial dotted remove operations for nested object removals', () => {
    const existing = {
      contactInfo: {
        secretary: { email: 'old@example.com', name: 'Secretary' },
      },
      id: '1',
    }
    const next = {
      contactInfo: {
        secretary: { email: undefined, name: 'Secretary' },
      },
      id: '1',
    }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        contactInfo: {
          secretary: { email: undefined },
        },
      },
      remove: ['contactInfo.secretary.email'],
    })
  })

  it('treats null as a nested field removal', () => {
    const existing = {
      contactInfo: {
        secretary: { email: 'old@example.com', name: 'Secretary' },
      },
      id: '1',
    }
    const next = {
      contactInfo: {
        secretary: { email: null, name: 'Secretary' },
      },
      id: '1',
    }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        contactInfo: {
          secretary: { email: null },
        },
      },
      remove: ['contactInfo.secretary.email'],
    })
  })

  it('replaces changed arrays instead of returning sparse array diffs as set operations', () => {
    const existing = {
      classes: [
        { class: 'ALO', entries: 1 },
        { class: 'AVO', entries: 2 },
      ],
      id: '1',
    }
    const next = {
      classes: [
        { class: 'ALO', entries: 3 },
        { class: 'AVO', entries: 2 },
      ],
      id: '1',
    }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        classes: next.classes,
      },
      set: { classes: next.classes },
    })
  })

  it('replaces nested changed arrays instead of returning sparse array diffs in changes', () => {
    const existing = {
      classes: [
        { class: 'ALO', judge: [{ id: 1, name: 'Judge 1' }] },
        { class: 'AVO', judge: [{ id: 3, name: 'Judge 3' }] },
      ],
      id: '1',
    }
    const next = {
      classes: [
        {
          class: 'ALO',
          judge: [
            { id: 1, name: 'Judge 1' },
            { id: 2, name: 'Judge 2' },
          ],
        },
        { class: 'AVO', judge: [{ id: 3, name: 'Judge 3' }] },
      ],
      id: '1',
    }

    expect(createPatch(next, existing)).toEqual({
      changes: {
        classes: next.classes,
      },
      set: { classes: next.classes },
    })
  })

  it('persists newly-added nested objects as whole-subtree set instead of dotted paths', () => {
    // Regression: when the parent map does not yet exist on the stored item,
    // `SET #a.#b = ...` fails with
    //   "The document path provided in the update expression is invalid for update".
    // The patch must set the whole parent object at the top-level path instead.
    const existing = {
      id: '1',
      judges: [{ id: 1, name: 'J1', official: true }],
    }
    const next = {
      contactInfo: {
        secretary: { email: 'a@b.c', name: '', phone: '' },
      },
      cost: { normal: 5 },
      id: '1',
      judges: [{ id: 1, name: 'J1', official: true }],
      official: {
        createdAt: '2025-08-29T05:14:02.541Z',
        createdBy: 'system',
        email: 'kikke@example.com',
        id: 'x-lzZyIYnX',
        kcId: 613302,
        location: 'Rovaniemi',
        modifiedAt: '2026-05-18T23:14:30.960Z',
        modifiedBy: 'system',
        name: 'Kaisa Haverinen',
        officer: ['NOME-A'],
        phone: '045',
      },
      placesPerDay: { '2026-08-22': 1 },
    }

    const result = createPatch(next, existing)

    expect(result.set).toEqual({
      contactInfo: next.contactInfo,
      cost: next.cost,
      official: next.official,
      placesPerDay: next.placesPerDay,
    })
    expect(result.remove).toBeUndefined()
  })

  it('descends into nested dotted paths only when the parent already exists', () => {
    const existing = {
      a: { b: { c: 1, d: 2 } },
      id: '1',
    }
    const next = {
      a: { b: { c: 1, d: 3 }, e: { f: 4 } }, // existing a.b -> descend; new a.e -> set whole
      id: '1',
    }

    const result = createPatch(next, existing)

    expect(result.set).toEqual({
      'a.b.d': 3,
      'a.e': { f: 4 },
    })
  })
})
