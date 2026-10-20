import type { StoredOrganizer } from '../lib/repositories/organizerRepository'
import { findOrganizerRepoints, repointRoles, unmappableRoleIds } from './organizerRepoints'

const eventOn = (id: string, organizerId: string, name: string) => ({ id, organizer: { id: organizerId, name } })

const live = (id: string, name: string): StoredOrganizer => ({ id, kcId: 1, name })
const deleted = (id: string, name: string): StoredOrganizer => ({ ...live(id, name), deletedAt: '2025-01-01' })

describe('findOrganizerRepoints', () => {
  it('maps an id the table does not hold to the one live organizer with the same name', () => {
    const repoints = findOrganizerRepoints(
      [eventOn('e1', 'orphan', 'AURAN NUUSKUT RY'), eventOn('e2', 'live', 'AURAN NUUSKUT RY')],
      [live('live', 'AURAN NUUSKUT RY')]
    )

    expect(repoints.targets).toEqual(new Map([['orphan', { id: 'live', name: 'AURAN NUUSKUT RY' }]]))
    expect(repoints.unmatched.size).toBe(0)
  })

  it('compares the names trimmed and without case, in Finnish', () => {
    const repoints = findOrganizerRepoints(
      [eventOn('e1', 'orphan', ' suomen sileäkarvaiset noutajat ry ')],
      [live('live', 'SUOMEN SILEÄKARVAISET NOUTAJAT RY')]
    )

    expect(repoints.targets.get('orphan')).toEqual({ id: 'live', name: 'SUOMEN SILEÄKARVAISET NOUTAJAT RY' })
  })

  it('leaves an id alone that a soft-deleted row holds', () => {
    const repoints = findOrganizerRepoints(
      [eventOn('e1', 'gone', 'Seura')],
      [deleted('gone', 'Seura'), live('live', 'Seura')]
    )

    expect(repoints.targets.size).toBe(0)
    expect(repoints.unmatched.size).toBe(0)
    expect(repoints.known).toEqual(new Set(['gone', 'live']))
  })

  it('does not match a soft-deleted organizer of the same name', () => {
    const repoints = findOrganizerRepoints([eventOn('e1', 'orphan', 'Seura')], [deleted('gone', 'Seura')])

    expect(repoints.targets.size).toBe(0)
    expect(repoints.unmatched.get('orphan')).toEqual({ candidates: 0, eventIds: ['e1'], names: ['Seura'] })
  })

  it('leaves an orphan unmatched when two live organizers share its name', () => {
    const repoints = findOrganizerRepoints(
      [eventOn('e1', 'orphan', 'Seura'), eventOn('e2', 'orphan', 'Seura')],
      [live('a', 'Seura'), live('b', 'SEURA')]
    )

    expect(repoints.targets.size).toBe(0)
    expect(repoints.unmatched.get('orphan')).toEqual({ candidates: 2, eventIds: ['e1', 'e2'], names: ['Seura'] })
  })

  it('leaves an orphan unmatched when its events name it differently', () => {
    const repoints = findOrganizerRepoints(
      [eventOn('e1', 'orphan', 'Seura'), eventOn('e2', 'orphan', 'Toinen')],
      [live('a', 'Seura'), live('b', 'Toinen')]
    )

    expect(repoints.targets.size).toBe(0)
    expect(repoints.unmatched.get('orphan')).toEqual({
      candidates: 2,
      eventIds: ['e1', 'e2'],
      names: ['Seura', 'Toinen'],
    })
  })

  it('passes over an event without an organizer', () => {
    const repoints = findOrganizerRepoints([{ id: 'e1' }], [live('a', 'Seura')])

    expect(repoints.targets.size).toBe(0)
    expect(repoints.unmatched.size).toBe(0)
  })

  it('matches no organizer row without a name, and no event that names none', () => {
    const repoints = findOrganizerRepoints(
      [{ id: 'e1', organizer: { id: 'orphan' } }],
      [{ id: 'nameless', kcId: 2, name: '' }]
    )

    expect(repoints.targets.size).toBe(0)
    expect(repoints.unmatched.get('orphan')).toEqual({ candidates: 0, eventIds: ['e1'], names: [''] })
  })
})

describe('repointRoles', () => {
  const targets = new Map([['orphan', { id: 'live', name: 'Seura' }]])

  it('moves a role on an orphan id to the live id', () => {
    expect(repointRoles({ orphan: 'secretary', other: 'admin' }, targets)).toEqual({
      live: 'secretary',
      other: 'admin',
    })
  })

  it.each([
    ['admin', 'secretary', 'admin'],
    ['secretary', 'admin', 'admin'],
    ['secretary', 'secretary', 'secretary'],
  ] as const)('keeps the stronger of %s on the orphan and %s on the live id: %s', (orphan, held, kept) => {
    expect(repointRoles({ live: held, orphan }, targets)).toEqual({ live: kept })
  })

  it('answers undefined when no role is on an orphan id', () => {
    expect(repointRoles({ other: 'admin' }, targets)).toBeUndefined()
    expect(repointRoles(undefined, targets)).toBeUndefined()
  })
})

describe('unmappableRoleIds', () => {
  const repoints = findOrganizerRepoints(
    [eventOn('e1', 'orphan', 'Seura'), eventOn('e2', 'twin', 'Kaksi')],
    [live('live', 'Seura'), live('k1', 'Kaksi'), live('k2', 'Kaksi'), deleted('gone', 'Poissa')]
  )

  it('names the role ids that are in no organizer row and have no single live match', () => {
    expect(
      unmappableRoleIds(
        { gone: 'admin', live: 'admin', nowhere: 'secretary', orphan: 'admin', twin: 'admin' },
        repoints
      )
    ).toEqual(['nowhere', 'twin'])
  })

  it('answers an empty list for a user without roles', () => {
    expect(unmappableRoleIds(undefined, repoints)).toEqual([])
  })
})
