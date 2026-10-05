import type { TFunction } from 'i18next'
import type { DogEvent, EventClassState, EventState, Registration } from '@/types'
import { eventWithParticipantsInvited } from '@/__mockData__/events'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '@/lib/registration'
import { confirmMoveToParticipants, invitationAfterMove, moveSendsPlaceMessage } from './moveConfirmation'

const PARTICIPANT_GROUP = '2021-02-10-ap'
// A branded TFunction cannot be satisfied by a plain function, so this follows the repo idiom
// of asserting a stub that spells out the key and its option values.
const t = ((key: string, opts?: Record<string, unknown>) =>
  [key, ...Object.values(opts ?? {}).filter(Boolean)].join(' ')) as TFunction<'translation'>

/** The invitations have gone out, and a place costs money. */
const invitedEvent: DogEvent = { ...eventWithParticipantsInvited, cost: 40, costMember: 40 }
/** The same trial, paid for only once the place is confirmed. */
const invitedEventPaidOnConfirmation: DogEvent = { ...invitedEvent, paymentTime: 'confirmation' }

/** Musti on the reserve list, place paid at entry. */
const paidReserveDog: Registration = {
  ...registrationWithStaticDates,
  dog: { ...registrationWithStaticDates.dog, name: 'Musti' },
  group: { key: GROUP_KEY_RESERVE, number: 1 },
  messagesSent: {},
}
/** Musti on the reserve list, nothing paid yet. */
const unpaidReserveDog: Registration = { ...paidReserveDog, paidAmount: undefined, paymentStatus: 'PENDING' }

describe('moveSendsPlaceMessage', () => {
  it.each<[EventClassState | EventState | undefined, string | undefined, string | undefined]>([
    ['picked', GROUP_KEY_RESERVE, PARTICIPANT_GROUP],
    ['picked', GROUP_KEY_CANCELLED, PARTICIPANT_GROUP],
    ['invited', GROUP_KEY_RESERVE, PARTICIPANT_GROUP],
  ])('is true in %s when a dog moves from %s to a participant group', (state, from, to) => {
    expect(moveSendsPlaceMessage(state, from, to)).toBe(true)
  })

  it.each<[string, EventClassState | EventState | undefined, string | undefined, string | undefined]>([
    ['the places are not picked yet', 'confirmed', GROUP_KEY_RESERVE, PARTICIPANT_GROUP],
    ['there is no state at all', undefined, GROUP_KEY_RESERVE, PARTICIPANT_GROUP],
    ['the dog already holds a place', 'picked', '2021-02-10-ip', PARTICIPANT_GROUP],
    ['the dog has no group yet', 'picked', undefined, PARTICIPANT_GROUP],
    ['the dog moves to the reserve list', 'picked', PARTICIPANT_GROUP, GROUP_KEY_RESERVE],
    ['the dog is cancelled', 'picked', PARTICIPANT_GROUP, GROUP_KEY_CANCELLED],
    ['the target group is unknown', 'picked', GROUP_KEY_RESERVE, undefined],
  ])('is false when %s', (_case, state, from, to) => {
    expect(moveSendsPlaceMessage(state, from, to)).toBe(false)
  })
})

describe('invitationAfterMove', () => {
  it('sends the koekutsu with the place when the place is paid for', () => {
    expect(invitationAfterMove(invitedEvent, paidReserveDog, PARTICIPANT_GROUP)).toBe('invited')
  })

  it('holds the koekutsu for the payment when the place is not paid for', () => {
    expect(invitationAfterMove(invitedEventPaidOnConfirmation, unpaidReserveDog, PARTICIPANT_GROUP)).toBe(
      'awaitingPayment'
    )
  })

  it('sends the koekutsu with the place when the place costs nothing', () => {
    const freeEvent: DogEvent = { ...invitedEventPaidOnConfirmation, cost: 0, costMember: 0 }
    expect(invitationAfterMove(freeEvent, unpaidReserveDog, PARTICIPANT_GROUP)).toBe('invited')
  })

  it('reads the dog as cancelled no longer, since the move restores it', () => {
    const cancelledDog: Registration = { ...paidReserveDog, cancelled: true, group: undefined }
    expect(invitationAfterMove(invitedEvent, cancelledDog, PARTICIPANT_GROUP)).toBe('invited')
  })

  it('sends no koekutsu while the places are only picked', () => {
    const pickedEvent: DogEvent = { ...invitedEvent, state: 'picked' }
    expect(invitationAfterMove(pickedEvent, paidReserveDog, PARTICIPANT_GROUP)).toBeUndefined()
  })

  it('sends no koekutsu to a dog that already has the current one', () => {
    const invitedDog: Registration = { ...paidReserveDog, messagesSent: { invitation: true } }
    expect(invitationAfterMove(invitedEvent, invitedDog, PARTICIPANT_GROUP)).toBeUndefined()
  })

  it('sends no koekutsu to the reserve list', () => {
    expect(invitationAfterMove(invitedEvent, paidReserveDog, GROUP_KEY_RESERVE)).toBeUndefined()
  })
})

describe('confirmMoveToParticipants', () => {
  const confirm = vi.fn().mockResolvedValue({ confirmed: true })

  beforeEach(() => {
    vi.clearAllMocks()
    confirm.mockResolvedValue({ confirmed: true })
  })

  it('lets a move that sends nothing through without asking', async () => {
    const result = await confirmMoveToParticipants({
      confirm,
      event: invitedEvent,
      fromGroupKey: PARTICIPANT_GROUP,
      registration: paidReserveDog,
      state: 'picked',
      t,
      toGroupKey: '2021-02-10-ip',
    })

    expect(result).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('names the dog and the koepaikkailmoitus when the places are picked', async () => {
    const result = await confirmMoveToParticipants({
      confirm,
      event: { ...invitedEvent, state: 'picked' },
      fromGroupKey: GROUP_KEY_RESERVE,
      registration: paidReserveDog,
      state: 'picked',
      t,
      toGroupKey: PARTICIPANT_GROUP,
    })

    expect(result).toBe(true)
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('Musti'),
        title: expect.stringContaining('Musti'),
      })
    )
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.not.stringContaining('invited') })
    )
  })

  it('promises the koekutsu too once the invitations are out and the place is paid for', async () => {
    await confirmMoveToParticipants({
      confirm,
      event: invitedEvent,
      fromGroupKey: GROUP_KEY_RESERVE,
      registration: paidReserveDog,
      state: 'invited',
      t,
      toGroupKey: PARTICIPANT_GROUP,
    })

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('invited') }))
  })

  it('says the koekutsu waits for the payment when the place is not paid for', async () => {
    await confirmMoveToParticipants({
      confirm,
      event: invitedEventPaidOnConfirmation,
      fromGroupKey: GROUP_KEY_RESERVE,
      registration: unpaidReserveDog,
      state: 'invited',
      t,
      toGroupKey: PARTICIPANT_GROUP,
    })

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringContaining('awaitingPayment') })
    )
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.not.stringContaining('invited') })
    )
  })

  it('refuses the move when the secretary cancels', async () => {
    confirm.mockResolvedValue({ confirmed: false })

    const result = await confirmMoveToParticipants({
      confirm,
      event: invitedEvent,
      fromGroupKey: GROUP_KEY_RESERVE,
      registration: paidReserveDog,
      state: 'picked',
      t,
      toGroupKey: PARTICIPANT_GROUP,
    })

    expect(result).toBe(false)
  })
})
