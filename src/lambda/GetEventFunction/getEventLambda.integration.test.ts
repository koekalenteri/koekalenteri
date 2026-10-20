import { constructAPIGwEvent } from '../test-utils/helpers'
import { storedEvent, uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import getEventLambda from './handler'

describe('getEventLambda against DynamoDB-local', () => {
  const client = new CustomDynamoClient('EventTable')

  const get = (id: string) => getEventLambda(constructAPIGwEvent(undefined, { pathParameters: { id } }))

  it('answers a live event', async () => {
    const live = storedEvent()
    await client.write(live)

    const result = await get(live.id)

    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toMatchObject({ id: live.id, name: live.name })
  })

  // KOE-1586: anyone holding the id of a deleted event got its row.
  it('answers a deleted event as it answers one that does not exist', async () => {
    const deleted = storedEvent({ deletedAt: new Date().toISOString(), deletedBy: 'secretary' })
    await client.write(deleted)

    const answer = await get(deleted.id)
    const missing = await get(uniqueId('event'))

    expect(answer.statusCode).toBe(404)
    expect(missing.statusCode).toBe(404)
    expect(answer.body).not.toContain(deleted.name)
  })
})
