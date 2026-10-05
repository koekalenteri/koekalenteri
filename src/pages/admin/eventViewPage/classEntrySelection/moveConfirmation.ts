import type { TFunction } from 'i18next'
import type { DogEvent, EventClassState, EventState, Registration } from '@/types'
import { isInvitationAwaitingPayment, shouldSendInvitationAfterPayment } from '@/lib/payment'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, isParticipantGroup } from '@/lib/registration'
import { isConfirmedEvent } from '@/lib/typeGuards'

/** `useConfirm` from material-ui-confirm, narrowed to the options this prompt passes. */
export type ConfirmMove = (opts: {
  title: string
  description: string
  confirmationText: string
  cancellationText: string
}) => Promise<{ confirmed: boolean }>

interface ConfirmMoveToParticipantsArgs {
  confirm: ConfirmMove
  event: DogEvent
  fromGroupKey: string | undefined
  registration: Registration
  state: EventClassState | EventState | undefined
  t: TFunction<'translation'>
  toGroupKey: string | undefined
}

/** The lists a dog is waiting on rather than holding a place in. */
const GROUPS_WITHOUT_A_PLACE = new Set([GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE])

/**
 * Whether taking this place mails the dog its koepaikkailmoitus. PutRegistrationGroupsFunction
 * sends one to every dog that reaches a participant group from the reserve or cancelled list once
 * the places are picked or invited, and to nobody else — a dog that already holds a place changes
 * day in silence. The prompt has to promise exactly what the backend then does (KOE-289).
 */
export const moveSendsPlaceMessage = (
  state: EventClassState | EventState | undefined,
  fromGroupKey: string | undefined,
  toGroupKey: string | undefined
): boolean =>
  (state === 'picked' || state === 'invited') &&
  isParticipantGroup(toGroupKey) &&
  GROUPS_WITHOUT_A_PLACE.has(fromGroupKey ?? '')

/** What the move does about the koekutsu: sends it with the place, or holds it for the payment. */
type InvitationAfterMove = 'invited' | 'awaitingPayment' | undefined

/**
 * What happens to the koekutsu once the dog holds the place. PutRegistrationGroupsFunction sends
 * it along with the koepaikkailmoitus only to a place that has been paid for; an unpaid place gets
 * its invitation from the payment callback once the money is in (KOE-1191). The same rules decide
 * here, read with the dog already in its new group, since that is what the backend sees.
 */
export const invitationAfterMove = (
  event: DogEvent,
  registration: Registration,
  toGroupKey: string | undefined
): InvitationAfterMove => {
  if (!isConfirmedEvent(event) || !toGroupKey || !isParticipantGroup(toGroupKey)) return undefined

  const moved = { ...registration, cancelled: false, group: { number: 0, ...registration.group, key: toGroupKey } }
  if (shouldSendInvitationAfterPayment(event, moved)) return 'invited'
  if (isInvitationAwaitingPayment(event, moved)) return 'awaitingPayment'
  return undefined
}

/**
 * Asks before a move that mails the dog its place, and answers true when the move may go ahead.
 * Every way to raise a dog — dragging it across, and both dialogs behind the kebab menu — asks
 * through this one function, so no route can send the message unannounced (KOE-289).
 */
export const confirmMoveToParticipants = async ({
  confirm,
  event,
  fromGroupKey,
  registration,
  state,
  t,
  toGroupKey,
}: ConfirmMoveToParticipantsArgs): Promise<boolean> => {
  if (!moveSendsPlaceMessage(state, fromGroupKey, toGroupKey)) return true

  const dogName = registration.dog.name
  const invitation = invitationAfterMove(event, registration, toGroupKey)
  const { confirmed } = await confirm({
    cancellationText: t('cancel'),
    confirmationText: t('eventManagement.participantSelection.moveToParticipants.confirm'),
    description: t(
      'eventManagement.participantSelection.moveToParticipants.description',
      invitation ? { context: invitation, dogName } : { dogName }
    ),
    title: t('eventManagement.participantSelection.moveToParticipants.title', { dogName }),
  })

  return confirmed
}
