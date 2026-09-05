import type { EventClassState, EventState } from '../../../../types'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'
import { confirmMoveToParticipants, moveSendsPlaceMessage } from './moveConfirmation'

const PARTICIPANT_GROUP = '2021-02-10-ap'
const t = (key: 'cancel') => key

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

describe('confirmMoveToParticipants', () => {
  const confirm = vi.fn().mockResolvedValue({ confirmed: true })

  beforeEach(() => {
    vi.clearAllMocks()
    confirm.mockResolvedValue({ confirmed: true })
  })

  it('lets a move that sends nothing through without asking', async () => {
    const result = await confirmMoveToParticipants({
      confirm,
      dogName: 'Musti',
      fromGroupKey: PARTICIPANT_GROUP,
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
      dogName: 'Musti',
      fromGroupKey: GROUP_KEY_RESERVE,
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
      expect.objectContaining({ description: expect.not.stringContaining('koekutsu') })
    )
  })

  it('promises the koekutsu too once the invitations are out', async () => {
    await confirmMoveToParticipants({
      confirm,
      dogName: 'Musti',
      fromGroupKey: GROUP_KEY_RESERVE,
      state: 'invited',
      t,
      toGroupKey: PARTICIPANT_GROUP,
    })

    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining('koekutsu') }))
  })

  it('refuses the move when the secretary cancels', async () => {
    confirm.mockResolvedValue({ confirmed: false })

    const result = await confirmMoveToParticipants({
      confirm,
      dogName: 'Musti',
      fromGroupKey: GROUP_KEY_RESERVE,
      state: 'picked',
      t,
      toGroupKey: PARTICIPANT_GROUP,
    })

    expect(result).toBe(false)
  })
})
