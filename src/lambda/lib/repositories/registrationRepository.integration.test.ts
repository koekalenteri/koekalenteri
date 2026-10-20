import type { JsonKcResult, JsonRegistration } from '../../../types'
import { uniqueId } from '../../test-utils/integration'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { readRegistration, writeKcResult } from './registrationRepository'

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
