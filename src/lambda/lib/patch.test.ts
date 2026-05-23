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
        classes: {
          0: { entries: 3 },
        },
      },
      set: { classes: next.classes },
    })
  })
})
