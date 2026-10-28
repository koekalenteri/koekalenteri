import type { JsonKcResult, JsonRegistration } from '../../../types'
import { uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { readRegistration, writeDogRegNo, writeKcResult } from './registrationRepository'

/**
 * What sending a dog's result to Kennelliitto came to is written on condition it is still the record
 * it was made from (KOE-1140). DynamoDB refuses an expression that declares a name it does not use,
 * which a mocked client never shows: the first send of every dog failed that way on dev.
 */
describe('writeKcResult against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventRegistrationTable')

  const kcResult = (at: string): JsonKcResult => ({ at, by: 'secretary', status: 'sent', tulosId: 1 })

  const storedRegistration = async (overrides: Partial<JsonRegistration> = {}) => {
    const registration = { eventId: uniqueId('event'), id: uniqueId('registration'), ...overrides }
    await client.write(registration)
    return registration
  }

  it('writes the first result of a dog that was never sent', async () => {
    const { eventId, id } = await storedRegistration()

    await expect(
      writeKcResult(eventId, id, kcResult('2026-10-19T17:25:38.000Z'), undefined, '2026-10-19T17:25:38.000Z')
    ).resolves.toBe(true)

    await expect(readRegistration(eventId, id, true)).resolves.toMatchObject({
      kcResult: kcResult('2026-10-19T17:25:38.000Z'),
      updatedAt: '2026-10-19T17:25:38.000Z',
    })
  })

  it('refuses a first result when another send recorded one meanwhile', async () => {
    const { eventId, id } = await storedRegistration({ kcResult: kcResult('2026-10-19T17:25:00.000Z') })

    await expect(
      writeKcResult(eventId, id, kcResult('2026-10-19T17:25:38.000Z'), undefined, '2026-10-19T17:25:38.000Z')
    ).resolves.toBe(false)

    await expect(readRegistration(eventId, id, true)).resolves.toMatchObject({
      kcResult: kcResult('2026-10-19T17:25:00.000Z'),
    })
  })

  it('replaces the result it was made from', async () => {
    const { eventId, id } = await storedRegistration({ kcResult: kcResult('2026-10-19T17:25:00.000Z') })

    await expect(
      writeKcResult(
        eventId,
        id,
        kcResult('2026-10-19T17:25:38.000Z'),
        '2026-10-19T17:25:00.000Z',
        '2026-10-19T17:25:38.000Z'
      )
    ).resolves.toBe(true)

    await expect(readRegistration(eventId, id, true)).resolves.toMatchObject({
      kcResult: kcResult('2026-10-19T17:25:38.000Z'),
    })
  })

  it('refuses a stale previous result', async () => {
    const { eventId, id } = await storedRegistration({ kcResult: kcResult('2026-10-19T17:25:20.000Z') })

    await expect(
      writeKcResult(
        eventId,
        id,
        kcResult('2026-10-19T17:25:38.000Z'),
        '2026-10-19T17:25:00.000Z',
        '2026-10-19T17:25:38.000Z'
      )
    ).resolves.toBe(false)

    await expect(readRegistration(eventId, id, true)).resolves.toMatchObject({
      kcResult: kcResult('2026-10-19T17:25:20.000Z'),
    })
  })

  it('creates no row for a registration that is not there', async () => {
    const eventId = uniqueId('event')
    const id = uniqueId('registration')

    await expect(
      writeKcResult(eventId, id, kcResult('2026-10-19T17:25:38.000Z'), undefined, '2026-10-19T17:25:38.000Z')
    ).resolves.toBe(false)

    await expect(readRegistration(eventId, id, true)).resolves.toBeUndefined()
  })
})

/** The number Kennelliitto knows the dog by replaces the entry's, and nothing else of the dog (KOE-1653). */
describe('writeDogRegNo against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventRegistrationTable')

  it('changes the number alone and moves updatedAt, leaving modifiedAt', async () => {
    const registration = {
      dog: { name: 'FILURIN PARADOX', regNo: 'SE22358/2021', rfid: '981098106889342' },
      eventId: uniqueId('event'),
      id: uniqueId('registration'),
      modifiedAt: '2026-10-01T10:00:00.000Z',
    }
    await client.write(registration)

    await writeDogRegNo(registration.eventId, registration.id, 'FI25555/20', '2026-10-28T10:00:00.000Z')

    await expect(readRegistration(registration.eventId, registration.id, true)).resolves.toMatchObject({
      dog: { name: 'FILURIN PARADOX', regNo: 'FI25555/20', rfid: '981098106889342' },
      modifiedAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-28T10:00:00.000Z',
    })
  })
})
