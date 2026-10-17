import type { JsonDogEvent, JsonUser } from '../../types'
import type { CopyImportRequest } from '../lib/eventCopy'
import { randomInt } from 'node:crypto'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { createEventCopy } from '../lib/eventCopy'
import { storedUser, uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import importCopiedEvent from './handler'

/** A scrubbed copy whose only address is the copier's, as the export makes it. */
const request = (copier: JsonUser): CopyImportRequest => {
  const sourceEvent: JsonDogEvent = {
    ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
    organizer: { id: 'org-source', name: 'Source club' },
  }
  const copyBy = { email: copier.email, name: copier.name }
  return {
    copier: copyBy,
    copy: createEventCopy({ event: sourceEvent, registrations: [] }, copyBy).copy,
    // No organizer of this environment has it, so an import that gets past the copier check stops here
    organizerKcId: randomInt(1_000_000_000, 2_000_000_000),
    source: { eventId: uniqueId('source'), stage: 'prod' },
  }
}

/**
 * The copier must be an admin of the environment the copy lands in, which `findAdmin` reads through
 * gsiEmail on the user table: the check after it is reached only when the query found the user.
 */
describe('importCopiedEvent against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')

  it('refuses a copier the user table does not know', async () => {
    await expect(importCopiedEvent(request(storedUser()))).rejects.toThrow(
      'The copier is not an admin in the target environment'
    )
  })

  it('refuses a copier who is a user but not an admin', async () => {
    const copier = storedUser()
    await client.write(copier)

    await expect(importCopiedEvent(request(copier))).rejects.toThrow(
      'The copier is not an admin in the target environment'
    )
  })

  it('finds an admin copier through gsiEmail and goes on to the organizer check', async () => {
    const copier = storedUser({ admin: true })
    await client.write(copier)

    await expect(importCopiedEvent(request(copier))).rejects.toThrow(/^No organizer with Kennel Club number/)
  })
})
