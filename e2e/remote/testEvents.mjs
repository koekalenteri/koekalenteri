/**
 * The test environment's own event for the browser tests run there after a deploy (KOE-1559). The
 * run writes one event before the tests and deletes it after them; nothing else in the stack is
 * touched, and the form is never sent, so no registration or email follows.
 *
 * Every such event belongs to the organizer id `e2e-remote`, which no real organizer has, so the
 * leftovers of a cancelled run are found by an exact query on gsiOrganizerStartDate, not a scan.
 * The release workflow lets one deploy of an environment run at a time, so removing every event
 * of that organizer never removes another run's.
 *
 * The table is the stack's EventTable (E2E_EVENT_TABLE); credentials and region come from the
 * environment as for any AWS client, and AWS_ENDPOINT_URL_DYNAMODB points it at a local database.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'

export const TEST_ORGANIZER = { id: 'e2e-remote', name: 'E2E-selaintesti' }

const tableName = () => {
  const table = process.env.E2E_EVENT_TABLE
  if (!table) throw new Error('E2E_EVENT_TABLE is not set: the physical name of the stack’s EventTable')
  return table
}

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

/** Stores the event as it is. */
export const putTestEvent = async (event) => {
  await client.send(new PutCommand({ Item: event, TableName: tableName() }))
}

/** The ids of the test organizer's events, one page after another. */
const testEventIds = async (startKey) => {
  const page = await client.send(
    new QueryCommand({
      ExclusiveStartKey: startKey,
      ExpressionAttributeValues: { ':organizerId': TEST_ORGANIZER.id },
      IndexName: 'gsiOrganizerStartDate',
      KeyConditionExpression: 'organizerId = :organizerId',
      ProjectionExpression: 'id',
      TableName: tableName(),
    })
  )
  const ids = (page.Items ?? []).map((item) => item.id)
  return page.LastEvaluatedKey ? [...ids, ...(await testEventIds(page.LastEvaluatedKey))] : ids
}

/** Deletes every event of the test organizer and answers their ids. */
export const sweepTestEvents = async () => {
  const table = tableName()
  const ids = await testEventIds()
  await Promise.all(ids.map((id) => client.send(new DeleteCommand({ Key: { id }, TableName: table }))))
  return ids
}
