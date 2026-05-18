import type { JsonConfirmedEvent, JsonUser } from '../../types'

type EventPolicyContext = {
  existing: Partial<JsonConfirmedEvent> | undefined
  item: Partial<JsonConfirmedEvent>
}

export const isEventWriteForbidden = (user: JsonUser, { existing, item }: EventPolicyContext): boolean => {
  if (user.admin) return false
  if (existing?.organizer?.id && !user.roles?.[existing.organizer.id]) return true
  if (item.organizer?.id && !user.roles?.[item.organizer.id]) return true

  return false
}

export const isEventDeletionForbidden = ({ existing, item }: EventPolicyContext): boolean => {
  if (!item.deletedAt) return false

  const state = existing?.state as string | undefined
  const isDeletable = state === 'draft' || state === 'tentative' || state === 'cancelled'

  return !isDeletable
}
