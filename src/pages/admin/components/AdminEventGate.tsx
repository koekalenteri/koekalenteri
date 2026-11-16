import type { ReactNode } from 'react'
import { useAtomValue } from 'jotai'
import { useParams } from 'react-router'
import { adminEventsAtom } from '../state'
import EventNotFound from './EventNotFound'

interface Props {
  readonly children: ReactNode
}

/**
 * Lets the pages of one event (`:id`) render only for an event on the administrator's list, which for
 * a secretary holds only their own clubs' events, by the same rule the server answers their entries
 * with. Another club's event says it is not found before any page reads its entries (a 403) or
 * subscribes to it (KOE-1738). The list suspends while it loads, so the real event never flashes as
 * not found. The pages keep their own check: they are rendered alone in their tests, and an id not on
 * the list reads as the new-event draft, which has no id.
 */
export function AdminEventGate({ children }: Props) {
  const { id } = useParams()
  const events = useAtomValue(adminEventsAtom)

  if (!id || !events.some((event) => event.id === id)) return <EventNotFound />

  return children
}
