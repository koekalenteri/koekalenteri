/**
 * Configuration for DynamoDB e2e test setup
 */

/**
 * Tables to clear and populate for e2e tests
 * Add or remove tables as needed
 *
 * The pattern for local tables is: '{table-name}-local'
 */
export const TABLES_TO_MANAGE = {
  // Main tables used in e2e tests
  EVENT_TABLE: 'event-table-local',
  REGISTRATION_TABLE: 'event-registration-table-local',
  DOG_TABLE: 'dog-table-local',

  // Additional tables that can be enabled as needed
  USER_TABLE: 'user-table-local',
  JUDGE_TABLE: 'judge-table-local',
  // OFFICIAL_TABLE: 'official-table-local',
  ORGANIZER_TABLE: 'organizer-table-local',
}

/**
 * Configuration for table key attributes
 * This is used when clearing tables to identify the primary key
 */
export const TABLE_KEYS: Record<string, string[]> = {
  // Format: 'table-name-pattern': ['primaryKeyAttribute', 'sortKeyAttribute?']
  'event-table': ['id'],
  'registration-table': ['eventId', 'id'],
  'dog-table': ['regNo'],
  'user-table': ['id'],
  'judge-table': ['id'],
  'official-table': ['id'],
  'organizer-table': ['id'],
}

/**
 * Get the key attributes for a table
 * @param tableName - The name of the table
 * @returns Array of key attribute names
 */
export function getTableKeyAttributes(tableName: string): string[] {
  for (const [pattern, keys] of Object.entries(TABLE_KEYS)) {
    if (tableName.includes(pattern)) {
      return keys
    }
  }
  // Default to 'id' if no match is found
  return ['id']
}
