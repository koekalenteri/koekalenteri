# E2E Testing with DynamoDB

This directory contains end-to-end tests using Playwright and real DynamoDB tables running in Docker.

## Setup

The e2e tests interact with actual DynamoDB tables running in Docker containers instead of mocking API responses. This approach provides more realistic testing of the application's behavior.

### Prerequisites

- Docker and Docker Compose must be running
- Local DynamoDB should be accessible at `http://localhost:8000`

## How It Works

### DynamoDB Utility

The `e2e/utils/dynamodb.ts` file provides utilities to:

1. Clear DynamoDB tables before each test
2. Insert mock data into DynamoDB tables before each test

### Test Data

Mock data is defined in the fixture files:
- `e2e/fixtures/events.ts` - Event data
- `e2e/fixtures/dogs.ts` - Dog data
- `e2e/fixtures/registrations.ts` - Registration data (initially empty)

### Usage in Tests

In your test files, use the `setupDynamoDB()` function in the `beforeEach` hook:

```typescript
import { test } from '@playwright/test'
import { setupDynamoDB } from '../utils/dynamodb'

test.describe('Your Test Suite', () => {
  test.beforeEach(async () => {
    // Clear tables and insert mock data before each test
    await setupDynamoDB()
  })

  // Your tests here
})
```

## How It Works Behind the Scenes

1. Before each test:
   - All tables are cleared using `clearAllTables()`
   - Mock data is inserted using `insertAllMockData()`

2. The DynamoDB client is configured to connect to the local Docker instance:
   ```typescript
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
   ```

3. Tables are cleared by:
   - Scanning all items in the table
   - Deleting them in batches of 25 (DynamoDB batch limit)

4. Mock data is inserted by:
   - Converting fixture data to the appropriate format
   - Preprocessing data to handle empty values in indexed fields
   - Inserting in batches of 25 (DynamoDB batch limit)

## Customizing

### Adding More Tables

To add more tables to clear/populate, modify the configuration in `e2e/config/dynamodb.config.ts`:

```typescript
// Uncomment or add more tables as needed
export const TABLES_TO_MANAGE = {
  EVENT_TABLE: 'event-table-local',
  REGISTRATION_TABLE: 'registration-table-local',
  DOG_TABLE: 'dog-table-local',

  // Additional tables that can be enabled as needed
  // USER_TABLE: 'user-table-local',
  // JUDGE_TABLE: 'judge-table-local',
  // OFFICIAL_TABLE: 'official-table-local',
}
```

The pattern for local tables is `{table-name}-local`. Make sure the table names match the actual tables in your local DynamoDB.

You'll also need to update the `insertAllMockData()` function in `e2e/utils/dynamodb.ts` if you need to insert data into the new tables.

### Adding More Mock Data

Add your mock data to the appropriate fixture files, and update the `insertAllMockData()` function if needed.

### Handling Empty Values in Indexed Fields

DynamoDB does not allow empty string values for attributes used as keys in indexes. The utility automatically handles this by replacing empty strings with timestamps for critical fields like `createdAt` and `modifiedAt`.

If you encounter validation errors like:

```
ValidationException: One or more parameter values are not valid. A value specified for a secondary index key is not supported.
```

You may need to update the preprocessing logic in `insertAllMockData()` to handle additional indexed fields:

```typescript
const processedEvents = events.map((event) => {
  const now = new Date().toISOString()
  return {
    ...event,
    // Replace empty strings with current timestamp for fields used in indexes
    createdAt: event.createdAt || now,
    modifiedAt: event.modifiedAt || now,
    // Add other indexed fields that might be empty
    // someOtherIndexedField: event.someOtherIndexedField || defaultValue,
  }
})
```

## Running Manually

You can manually clear and populate the DynamoDB tables using the provided script:

```bash
# Clear and populate tables (both operations)
npm run test-e2e:setup-db

# Only clear tables
npm run test-e2e:setup-db -- --clear

# Only populate tables
npm run test-e2e:setup-db -- --populate
```

This is useful for debugging or setting up a specific test state.

## Docker Network Configuration

The utility automatically detects whether it's running inside a Docker network:

- When running with `AWS_SAM_LOCAL=true`, it connects to `http://dynamodb:8000`
- When running outside Docker, it connects to `http://localhost:8000`

If you're running in a Docker network but not using SAM local, you can set the environment variable:

```bash
IN_DOCKER_NETWORK=true npm run test-e2e:setup-db
```

## Troubleshooting

If you encounter issues:

1. Ensure Docker is running and DynamoDB is accessible at `http://localhost:8000`
2. Check the console logs for error messages
3. Verify that the table names in the code match the actual table names in your local DynamoDB
4. Make sure the DynamoDB container is running: `npm run dynamodb:start`
5. If running in a Docker network, set `IN_DOCKER_NETWORK=true` to use the correct endpoint
