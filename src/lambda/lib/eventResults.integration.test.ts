import type { DeepPartial, JsonConfirmedEvent, JsonEventResult } from '../../types'
import { asJsonConfirmedEvent } from '../test-utils/helpers'
import { storedEvent, uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { processResultSubmissions } from './eventResults'
import { readEventRegistrations, readRegistration } from './repositories/registrationRepository'

/**
 * Two saves of the same dog close together (KOE-1490). Each batch classifies its dogs against the rows it
 * read, and writes them one at a time, so a save can be classified against a result another save replaces
 * before it is written. The second save here works from the reading taken before the first landed, as it
 * does when both requests read the rows at the same moment.
 */
describe('processResultSubmissions against DynamoDB-local', () => {
  const events = new CustomDynamoClient('EventTable')
  const registrations = new CustomDynamoClient('EventRegistrationTable')

  const stations = [1, 2, 3, 4].map((number) => ({ date: '2026-09-12' as const, id: `post-${number}`, number }))

  const storedTrial = async (): Promise<JsonConfirmedEvent> => {
    const event = asJsonConfirmedEvent({
      ...storedEvent({ eventType: 'NOWT', startDate: '2026-09-12' }),
      classes: [],
      state: 'confirmed',
      stations,
    })
    await events.write(event)
    return event
  }

  /** A dog that ran, its result as given: a row may hold one older than the result's version. */
  const storedDog = async (eventId: string, eventResult?: DeepPartial<JsonEventResult>) => {
    const id = uniqueId('registration')
    await registrations.write({
      class: 'AVO',
      eventId,
      eventType: 'NOWT',
      group: { date: '2026-09-12', key: 'AVO-AP', number: 1 },
      id,
      state: 'ready',
      ...(eventResult ? { eventResult } : {}),
    })
    return id
  }

  const task = (exercise: number, points: number, updatedAt?: string) => ({
    exercise,
    part: 0,
    points,
    ...(updatedAt ? { updatedAt, updatedBy: 'Sihteeri' } : {}),
  })
  const round = (...points: number[]) => points.map((value, index) => task(index + 1, value))

  it('reports a whole-round save classified before another landed as a conflict, over the result that landed', async () => {
    const event = await storedTrial()
    const before = '2026-09-12T08:00:00.000Z'
    const id = await storedDog(event.id, {
      tasks: [1, 2, 3, 4].map((exercise) => task(exercise, 10, before)),
      updatedAt: before,
      updatedBy: 'Sihteeri',
    })
    const reading = await readEventRegistrations(event.id, true)

    const first = await processResultSubmissions(
      event.id,
      event,
      reading,
      [{ basedOn: before, eventResult: { tasks: round(17, 18, 16, 14) }, id }],
      'Sihteeri A'
    )
    const second = await processResultSubmissions(
      event.id,
      event,
      reading,
      [{ basedOn: before, eventResult: { tasks: round(12, 12, 12, 12) }, id }],
      'Sihteeri B'
    )

    expect(first.saved).toHaveLength(1)
    expect(second).toMatchObject({
      conflicts: [{ id, stored: { points: 65, updatedBy: 'Sihteeri A' }, submitted: { points: 48 } }],
      saved: [],
    })
    await expect(readRegistration(event.id, id, true)).resolves.toMatchObject({
      eventResult: { points: 65, updatedBy: 'Sihteeri A' },
    })
  })

  it("keeps both posts' scores when two posts save the same dog from one reading", async () => {
    const event = await storedTrial()
    const id = await storedDog(event.id)
    const reading = await readEventRegistrations(event.id, true)

    await processResultSubmissions(
      event.id,
      event,
      reading,
      [{ eventResult: { tasks: [task(1, 17)] }, id, stationId: 'post-1' }],
      'Suorituspaikka 1'
    )
    const second = await processResultSubmissions(
      event.id,
      event,
      reading,
      [{ eventResult: { tasks: [task(2, 18)] }, id, stationId: 'post-2' }],
      'Suorituspaikka 2'
    )

    expect(second.conflicts).toEqual([])
    const stored = await readRegistration(event.id, id, true)
    expect(stored?.eventResult?.tasks).toEqual([
      expect.objectContaining({ exercise: 1, points: 17, updatedBy: 'Suorituspaikka 1' }),
      expect.objectContaining({ exercise: 2, points: 18, updatedBy: 'Suorituspaikka 2' }),
    ])
  })

  it('saves over a result stored without a version, and keeps the post it did not score', async () => {
    const event = await storedTrial()
    // A row older than the result's version: neither the result nor its task carries `updatedAt`.
    const id = await storedDog(event.id, { tasks: [task(1, 17)], updatedBy: 'Sihteeri' })
    const reading = await readEventRegistrations(event.id, true)

    const answer = await processResultSubmissions(
      event.id,
      event,
      reading,
      [{ eventResult: { tasks: [task(2, 18)] }, id, stationId: 'post-2' }],
      'Suorituspaikka 2'
    )

    expect(answer.saved).toHaveLength(1)
    const stored = await readRegistration(event.id, id, true)
    expect(stored?.eventResult?.tasks).toEqual([
      expect.objectContaining({ exercise: 1, points: 17 }),
      expect.objectContaining({ exercise: 2, points: 18, updatedBy: 'Suorituspaikka 2' }),
    ])
  })
})
