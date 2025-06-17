import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { BatchWriteCommand, DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb'

import { getTableKeyAttributes, TABLES_TO_MANAGE } from '../config/dynamodb.config'
import { dogs } from '../fixtures/dogs'
import { events } from '../fixtures/events'
import { judges } from '../fixtures/judges'
import { organizers } from '../fixtures/organizers'
import { registrations } from '../fixtures/registrations'
import { users } from '../fixtures/users'

// DynamoDB client configured to connect to local Docker instance
// Determine if we're running inside Docker network
const isInDockerNetwork = process.env.AWS_SAM_LOCAL === 'true' || process.env.IN_DOCKER_NETWORK === 'true'
const endpoint = isInDockerNetwork ? 'http://dynamodb:8000' : 'http://localhost:8000'

const client = new DynamoDBClient({
  endpoint,
  region: 'local',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
})

console.log(`DynamoDB client configured with endpoint: ${endpoint}`)

const docClient = DynamoDBDocumentClient.from(client)

/**
 * Clears all items from a DynamoDB table
 * @param tableName - The name of the table to clear
 */
export const clearTable = async (tableName: string): Promise<void> => {
  console.log(`Clearing table: ${tableName}`)

  try {
    // Scan to get all items
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: tableName,
      })
    )

    if (!scanResult.Items || scanResult.Items.length === 0) {
      console.log(`Table ${tableName} is already empty`)
      return
    }

    // Delete items in batches of 25 (DynamoDB batch limit)
    const items = scanResult.Items
    const chunkSize = 25

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)

      // For each item, create a delete request
      const deleteRequests = chunk.map((item) => {
        // Extract the key attributes based on the table configuration
        const keyAttributes = getTableKeyAttributes(tableName)
        const key: Record<string, any> = {}

        // Build the key object using the configured key attributes
        for (const attr of keyAttributes) {
          key[attr] = item[attr]
        }

        return {
          DeleteRequest: {
            Key: key,
          },
        }
      })

      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: deleteRequests,
          },
        })
      )
    }

    console.log(`Successfully cleared ${items.length} items from ${tableName}`)
  } catch (error) {
    console.error(`Error clearing table ${tableName}:`, error)
    throw error
  }
}

/**
 * Inserts items into a DynamoDB table
 * @param tableName - The name of the table
 * @param items - The items to insert
 */
export const insertItems = async <T>(tableName: string, items: T[]): Promise<void> => {
  if (!items || items.length === 0) {
    console.log(`No items to insert into ${tableName}`)
    return
  }

  console.log(`Inserting ${items.length} items into ${tableName}`)

  try {
    // Insert items in batches of 25 (DynamoDB batch limit)
    const chunkSize = 25

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize)

      const putRequests = chunk.map((item) => ({
        PutRequest: {
          Item: item as Record<string, any>,
        },
      }))

      await docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: putRequests,
          },
        })
      )
    }

    console.log(`Successfully inserted ${items.length} items into ${tableName}`)
  } catch (error) {
    console.error(`Error inserting items into ${tableName}:`, error)
    throw error
  }
}

/**
 * Clears all tables used in e2e tests
 */
export const clearAllTables = async (): Promise<void> => {
  const tables = Object.values(TABLES_TO_MANAGE)

  console.log(`Clearing ${tables.length} tables: ${tables.join(', ')}`)

  for (const table of tables) {
    await clearTable(table)
  }
}

/**
 * Inserts all mock data into DynamoDB tables
 */
export const insertAllMockData = async (): Promise<void> => {
  // Process events to ensure no empty string values for indexed fields
  const processedEvents = events.map((event) => {
    const now = new Date().toISOString()
    return {
      ...event,
      // Replace empty strings with current timestamp for fields used in indexes
      createdAt: event.createdAt || now,
      modifiedAt: event.modifiedAt || now,
    }
  })

  // Insert events
  await insertItems(TABLES_TO_MANAGE.EVENT_TABLE, processedEvents)

  // Insert dogs (convert from Record to array)
  const dogArray = Object.values(dogs)
  await insertItems(TABLES_TO_MANAGE.DOG_TABLE, dogArray)

  // Insert registrations (if any exist)
  const registrationArray = Object.values(registrations)
  if (registrationArray.length > 0) {
    await insertItems(TABLES_TO_MANAGE.REGISTRATION_TABLE, registrationArray)
  }

  // Insert judges (if table is enabled)
  if (TABLES_TO_MANAGE.JUDGE_TABLE) {
    await insertItems(TABLES_TO_MANAGE.JUDGE_TABLE, judges)
  }

  // Insert users (if table is enabled)
  if (TABLES_TO_MANAGE.USER_TABLE) {
    await insertItems(TABLES_TO_MANAGE.USER_TABLE, users)
  }

  // Insert organizers (if table is enabled)
  if (TABLES_TO_MANAGE.ORGANIZER_TABLE) {
    await insertItems(TABLES_TO_MANAGE.ORGANIZER_TABLE, organizers)
  }
}

/**
 * Setup function to be called before each test
 * Clears all tables and inserts mock data
 */
export const setupDynamoDB = async (): Promise<void> => {
  await clearAllTables()
  await insertAllMockData()
}
