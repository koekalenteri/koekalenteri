import { uniqueId } from '../../test-utils/integration'
import {
  createConnection,
  getConnection,
  queryAdminConnections,
  queryPublicConnections,
  removeConnection,
  subscribeConnection,
  unsubscribeAdminChannel,
} from './connectionRepository'

/** The audience partitions are shared with every other test; only this test's connections count. */
const ownOf = (ids: string[], connections: { connectionId: string }[]) =>
  connections
    .map(({ connectionId }) => connectionId)
    .filter((id) => ids.includes(id))
    .sort((a, b) => a.localeCompare(b))

describe('the connection repository against DynamoDB-local', () => {
  it('reads the audiences through audience-index as the subscriptions move connections between them', async () => {
    const reader = uniqueId('connection')
    const secretary = uniqueId('connection')
    const ids = [reader, secretary]
    const expiresAt = Math.floor(Date.now() / 1000) + 3600
    await createConnection({ connectionId: reader, expiresAt })
    await createConnection({ connectionId: secretary, expiresAt })

    expect(ownOf(ids, await queryPublicConnections())).toEqual([reader, secretary].sort((a, b) => a.localeCompare(b)))
    expect(ownOf(ids, await queryAdminConnections())).toEqual([])

    const eventId = uniqueId('event')
    await subscribeConnection(secretary, eventId)

    expect(ownOf(ids, await queryPublicConnections())).toEqual([reader])
    expect(ownOf(ids, await queryAdminConnections())).toEqual([secretary])

    await unsubscribeAdminChannel(secretary)

    expect(ownOf(ids, await queryAdminConnections())).toEqual([])
    expect(ownOf(ids, await queryPublicConnections())).toEqual([reader, secretary].sort((a, b) => a.localeCompare(b)))
    await expect(getConnection(secretary)).resolves.toEqual({
      audience: 'public',
      connectionId: secretary,
      eventId,
      expiresAt,
    })
  })

  it('removes a connection, and an unknown one without complaint', async () => {
    const connectionId = uniqueId('connection')
    await createConnection({ connectionId, expiresAt: Math.floor(Date.now() / 1000) + 3600 })

    await removeConnection(connectionId)
    await removeConnection(uniqueId('connection'))

    await expect(getConnection(connectionId)).resolves.toBeUndefined()
    expect(ownOf([connectionId], await queryPublicConnections())).toEqual([])
  })
})
