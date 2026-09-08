import { renderHook } from '@testing-library/react'
import { heldAdminEventIds, releaseAdminEventAtoms, useAdminEventScope } from './eventScope'
import { adminEventAtom } from './events/derivedAtoms'
import { adminEventRegistrationsAtom } from './registrations/atoms'
import { adminEventRegistrationAtom } from './registrations/derivedAtoms'

const paramsOf = <P>(family: { getParams(): Iterable<P> }) => [...family.getParams()]

describe('releaseAdminEventAtoms', () => {
  it('drops the instances every family holds for the event, and only those', () => {
    adminEventAtom('event-1')
    adminEventAtom('event-2')
    adminEventRegistrationsAtom('event-1')
    adminEventRegistrationAtom({ eventId: 'event-1', id: 'reg-1' })
    adminEventRegistrationAtom({ eventId: 'event-2', id: 'reg-2' })

    releaseAdminEventAtoms('event-1')

    expect(paramsOf(adminEventAtom)).not.toContain('event-1')
    expect(paramsOf(adminEventAtom)).toContain('event-2')
    expect(paramsOf(adminEventRegistrationsAtom)).not.toContain('event-1')
    expect(paramsOf(adminEventRegistrationAtom)).toEqual([{ eventId: 'event-2', id: 'reg-2' }])
  })
})

describe('useAdminEventScope', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('releases the atoms a moment after the last view of the event unmounts', () => {
    adminEventAtom('event-3')
    const { unmount } = renderHook(() => useAdminEventScope('event-3'))

    expect(heldAdminEventIds()).toContain('event-3')
    unmount()
    expect(paramsOf(adminEventAtom)).toContain('event-3')

    vi.runAllTimers()

    expect(paramsOf(adminEventAtom)).not.toContain('event-3')
  })

  // Leaving the event page for its results page unmounts one view and mounts the next; the atoms
  // must survive the hand-over, or every such move would refetch the event and its registrations.
  it('keeps the atoms while another view of the same event mounts in time', () => {
    adminEventAtom('event-4')
    const first = renderHook(() => useAdminEventScope('event-4'))
    first.unmount()
    const second = renderHook(() => useAdminEventScope('event-4'))

    vi.runAllTimers()

    expect(paramsOf(adminEventAtom)).toContain('event-4')
    second.unmount()
    vi.runAllTimers()
    expect(paramsOf(adminEventAtom)).not.toContain('event-4')
  })

  it('holds nothing for a view without an event', () => {
    const { unmount } = renderHook(() => useAdminEventScope(undefined))

    expect(heldAdminEventIds()).not.toContain(undefined)
    unmount()
  })
})
