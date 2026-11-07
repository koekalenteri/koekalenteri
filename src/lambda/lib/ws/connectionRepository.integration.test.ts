import { uniqueId } from '../../test-utils/integration'
import {
  authenticateConnection,
  countOpenConnectionsInSourceBucket,
  countOpenPublicConnections,
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

  describe('open connection counts', () => {
    const inAnHour = () => Math.floor(Date.now() / 1000) + 3600
    const anHourAgo = () => Math.floor(Date.now() / 1000) - 3600
    const LARGE_LIMIT = 100_000
    const connect = (expiresAt: number, sourceBucket?: string) =>
      createConnection({ connectionId: uniqueId('connection'), expiresAt, sourceBucket })

    it('counts one source bucket through source-index, leaving out the expired rows and the other buckets', async () => {
      const sourceBucket = uniqueId('source')
      await connect(inAnHour(), sourceBucket)
      await connect(inAnHour(), sourceBucket)
      await connect(anHourAgo(), sourceBucket)
      await connect(inAnHour(), uniqueId('source'))
      await connect(inAnHour())

      await expect(countOpenConnectionsInSourceBucket(sourceBucket, LARGE_LIMIT)).resolves.toBe(2)
    })

    it('stops counting a source bucket at the limit', async () => {
      const sourceBucket = uniqueId('source')
      await connect(anHourAgo(), sourceBucket)
      await connect(inAnHour(), sourceBucket)
      await connect(inAnHour(), sourceBucket)
      await connect(inAnHour(), sourceBucket)

      await expect(countOpenConnectionsInSourceBucket(sourceBucket, 2)).resolves.toBe(2)
    })

    it('keeps the source bucket on the row through authentication and subscriptions', async () => {
      const sourceBucket = uniqueId('source')
      const connectionId = uniqueId('connection')
      await createConnection({ connectionId, expiresAt: inAnHour(), sourceBucket })

      await authenticateConnection({ connectionId, expiresAt: inAnHour(), userId: uniqueId('user') })
      await subscribeConnection(connectionId, uniqueId('event'))

      await expect(getConnection(connectionId)).resolves.toMatchObject({ audience: 'admin', sourceBucket })
      await expect(countOpenConnectionsInSourceBucket(sourceBucket, LARGE_LIMIT)).resolves.toBe(1)
    })

    // This file is the only one writing connections, and its tests run one at a time.
    it('counts the open public connections, without an expired row or an admin one', async () => {
      const before = await countOpenPublicConnections(LARGE_LIMIT)
      await connect(anHourAgo())
      const admin = uniqueId('connection')
      await createConnection({ connectionId: admin, expiresAt: inAnHour() })
      await subscribeConnection(admin, uniqueId('event'))
      await expect(countOpenPublicConnections(LARGE_LIMIT)).resolves.toBe(before)

      await connect(inAnHour())
      await connect(inAnHour())
      await expect(countOpenPublicConnections(LARGE_LIMIT)).resolves.toBe(before + 2)
      await expect(countOpenPublicConnections(1)).resolves.toBe(1)
    })
  })
})
