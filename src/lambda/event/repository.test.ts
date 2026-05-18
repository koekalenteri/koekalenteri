import { jest } from '@jest/globals'
import { createEventRepository } from './repository'
import { createEvent } from './testUtils'

describe('createEventRepository', () => {
  it('writes full events in create flow', async () => {
    const write = jest.fn(async () => undefined)
    const repository = createEventRepository({
      db: { read: jest.fn(async () => undefined), update: jest.fn(async () => undefined), write } as any,
    })
    const event = createEvent()

    await expect(repository.create(event)).resolves.toEqual(event)
    expect(write).toHaveBeenCalledWith(event, expect.any(String))
  })

  it('translates generic patches to DynamoDB set and remove operations', async () => {
    const updated = createEvent({ name: 'Updated Event' })
    const update = jest.fn(async () => undefined)
    const read = jest.fn(async () => updated)
    const repository = createEventRepository({
      db: { read, update, write: jest.fn(async () => undefined) } as any,
    })

    await expect(
      repository.patch({
        eventId: updated.id,
        remove: ['qualificationStartDate'],
        set: { name: 'Updated Event' },
      })
    ).resolves.toEqual(updated)

    expect(update).toHaveBeenCalledWith(
      { id: updated.id },
      {
        remove: ['qualificationStartDate'],
        set: { name: 'Updated Event' },
      },
      expect.any(String)
    )
    expect(read).toHaveBeenCalledWith({ id: updated.id }, expect.any(String))
  })

  it('uses a dedicated set-only path for aggregate patches', async () => {
    const updated = createEvent({ entries: 12, members: 8 })
    const update = jest.fn(async () => undefined)
    const read = jest.fn(async () => updated)
    const repository = createEventRepository({
      db: { read, update, write: jest.fn(async () => undefined) } as any,
    })

    await expect(
      repository.patchAggregates({
        eventId: updated.id,
        set: { entries: 12, members: 8 },
      })
    ).resolves.toEqual(updated)

    expect(update).toHaveBeenCalledWith(
      { id: updated.id },
      {
        set: { entries: 12, members: 8 },
      },
      expect.any(String)
    )
  })

  it('throws when patchAggregates is called without set operations', async () => {
    const repository = createEventRepository({
      db: {
        read: jest.fn(async () => undefined),
        update: jest.fn(async () => undefined),
        write: jest.fn(async () => undefined),
      } as any,
    })

    await expect(repository.patchAggregates({ eventId: 'event-1' } as any)).rejects.toThrow(
      'Event aggregate patch must include set operations'
    )
  })
})
