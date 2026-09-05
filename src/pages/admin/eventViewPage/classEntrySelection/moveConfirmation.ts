import type { EventClassState, EventState } from '../../../../types'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, isParticipantGroup } from '../../../../lib/registration'

/** `useConfirm` from material-ui-confirm, narrowed to the options this prompt passes. */
export type ConfirmMove = (opts: {
  title: string
  description: string
  confirmationText: string
  cancellationText: string
}) => Promise<{ confirmed: boolean }>

interface ConfirmMoveToParticipantsArgs {
  confirm: ConfirmMove
  /** Optional the way the dog's own record has it; the prompt names whatever is there. */
  dogName: string | undefined
  fromGroupKey: string | undefined
  state: EventClassState | EventState | undefined
  /** Only the cancel label is translated; the prompt itself is written out in Finnish below. */
  t: (key: 'cancel') => string
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

/**
 * Asks before a move that mails the dog its place, and answers true when the move may go ahead.
 * Every way to raise a dog — dragging it across, and both dialogs behind the kebab menu — asks
 * through this one function, so no route can send the message unannounced (KOE-289).
 */
export const confirmMoveToParticipants = async ({
  confirm,
  dogName,
  fromGroupKey,
  state,
  t,
  toGroupKey,
}: ConfirmMoveToParticipantsArgs): Promise<boolean> => {
  if (!moveSendsPlaceMessage(state, fromGroupKey, toGroupKey)) return true

  const extra = state === 'invited' ? ' sekä koekutsu' : ''
  const { confirmed } = await confirm({
    cancellationText: t('cancel'),
    confirmationText: 'Lisää osallistujiin',
    description: `Kun koirakko on lisätty, koirakolle lähtee vahvistusviesti koepaikasta${extra}. Oletko varma että haluat lisätä koiran ${dogName} osallistujiin?`,
    title: `Olet lisäämässä koiraa ${dogName} osallistujiin`,
  })

  return confirmed
}
