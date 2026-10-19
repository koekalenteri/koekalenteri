import type { JsonDog } from '../../../types'
import { beforeDayKeys } from '../../../test-utils/finnishDays'
import { uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { readDog, writeMigratedDog } from './dogRepository'
import { readRegistration, readRegistrationEventIds, writeMigratedRegistration } from './registrationRepository'

const conditionFailure = expect.objectContaining({ name: 'ConditionalCheckFailedException' })

// The KOE-1547 day migrations write a row only as it was read: a save in between makes them read it again.
describe('the conditional writes of a data migration against DynamoDB-local', () => {
  const registrations = new CustomDynamoClient('EventRegistrationTable')
  const dogs = new CustomDynamoClient('DogTable')

  const registration = (eventId: string, updatedAt?: string) => ({
    dates: [{ date: '2026-05-31T21:00:00.000Z', time: 'ap' }],
    eventId,
    id: uniqueId('registration'),
    ...(updatedAt ? { updatedAt } : {}),
  })

  it('names the event of every registration row once', async () => {
    const eventId = uniqueId('event')
    await registrations.batchWrite([registration(eventId), registration(eventId)])

    const eventIds = await readRegistrationEventIds()

    expect(eventIds.filter((id) => id === eventId)).toEqual([eventId])
  })

  it('writes a registration that still has the updatedAt read, and refuses one moved since', async () => {
    const row = registration(uniqueId('event'), 'read')
    await registrations.write(row)
    const changes = { set: { dates: [{ date: '2026-06-01', time: 'ap' }], updatedAt: 'migrated' } }

    await expect(writeMigratedRegistration(row.eventId, row.id, changes, 'stale')).rejects.toEqual(conditionFailure)
    await writeMigratedRegistration(row.eventId, row.id, changes, 'read')

    await expect(readRegistration(row.eventId, row.id, true)).resolves.toMatchObject({
      dates: [{ date: '2026-06-01', time: 'ap' }],
      updatedAt: 'migrated',
    })
  })

  it('does not create a registration deleted since it was read', async () => {
    const eventId = uniqueId('event')
    const id = uniqueId('registration')

    await expect(writeMigratedRegistration(eventId, id, { set: { updatedAt: 'migrated' } }, undefined)).rejects.toEqual(
      conditionFailure
    )
    await expect(readRegistration(eventId, id, true)).resolves.toBeUndefined()
  })

  it('writes a dog whose dates are still the ones read, and refuses one the lookup replaced', async () => {
    const dog = {
      dob: '2021-01-01T00:00:00',
      regNo: uniqueId('FI'),
      results: [
        { class: 'ALO', date: '2025-06-01T00:00:00', judge: 'J', location: 'L', result: 'ALO1', type: 'NOME-B' },
      ],
    }
    await dogs.write(dog)
    // The rows as they were read, with the days a row stored before KOE-1547 holds.
    const read: JsonDog = JSON.parse(JSON.stringify(dog))
    const stale: JsonDog = { ...read, dob: beforeDayKeys('2020-01-01T00:00:00') }

    await expect(writeMigratedDog(stale, { set: { dob: '2020-01-01' } })).rejects.toEqual(conditionFailure)
    await writeMigratedDog(read, { set: { dob: '2021-01-01' } })

    await expect(readDog(dog.regNo)).resolves.toMatchObject({ dob: '2021-01-01' })
  })
})
