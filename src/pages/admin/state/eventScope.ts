import { useEffect } from 'react'
import {
  adminConfirmedEventAtom,
  adminEventAtom,
  adminKnownKcIdsAtom,
  adminLinkedKcIdsAtom,
} from './events/derivedAtoms'
import { adminEditableEventByIdAtom } from './events/editableAtoms'
import {
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
  adminPendingRegistrationGroupMovesAtom,
} from './registrations/atoms'
import { adminEventRegistrationAtom, adminProjectedEventRegistrationsAtom } from './registrations/derivedAtoms'
import { adminEditableEventRegistrationByEventIdAndIdAtom } from './registrations/editableAtoms'

/** The families that hold one instance per event the administrator has opened. */
const EVENT_FAMILIES = [
  adminConfirmedEventAtom,
  adminEditableEventByIdAtom,
  adminEventAtom,
  adminEventRegistrationsAtom,
  adminEventRegistrationsCursorAtom,
  adminEventRegistrationsFetchedAtAtom,
  adminKnownKcIdsAtom,
  adminLinkedKcIdsAtom,
  adminPendingRegistrationGroupMovesAtom,
  adminProjectedEventRegistrationsAtom,
] as const

/** The families keyed by an event and one of its registrations. */
const REGISTRATION_FAMILIES = [adminEditableEventRegistrationByEventIdAndIdAtom, adminEventRegistrationAtom] as const

/**
 * Drops every atom instance the families hold for the event. An atom family remembers each
 * instance it has handed out until told otherwise, so a long administrator's session kept every
 * event it had ever opened, registrations and all (KOE-1343). The next read of the event creates
 * the instances again, from storage and the server as on the first visit.
 */
export const releaseAdminEventAtoms = (eventId: string) => {
  for (const family of EVENT_FAMILIES) family.remove(eventId)
  for (const family of REGISTRATION_FAMILIES) {
    for (const params of [...family.getParams()]) {
      if (params.eventId === eventId) family.remove(params)
    }
  }
}

/** How long an event's atoms outlive its last view: long enough for the next view of the same event to mount. */
const RELEASE_DELAY_MS = 1000

/** How many mounted views hold each event; the atoms go once the last one has gone. */
const scopes = new Map<string, number>()

/** The events whose atoms are held by a mounted view right now. */
export const heldAdminEventIds = () => [...scopes.keys()]

/**
 * Claims the event's atoms for as long as the view is mounted, and releases them a moment after the
 * last view of the event has unmounted. The moment matters: leaving the event page for its results
 * page unmounts one view and mounts the next in the same tick, and the hand-over must not cost a
 * refetch.
 */
export const useAdminEventScope = (eventId: string | undefined) => {
  useEffect(() => {
    if (!eventId) return
    scopes.set(eventId, (scopes.get(eventId) ?? 0) + 1)

    return () => {
      const left = (scopes.get(eventId) ?? 1) - 1
      if (left > 0) {
        scopes.set(eventId, left)
        return
      }
      scopes.delete(eventId)
      setTimeout(() => {
        if (!scopes.has(eventId)) releaseAdminEventAtoms(eventId)
      }, RELEASE_DELAY_MS)
    }
  }, [eventId])
}
