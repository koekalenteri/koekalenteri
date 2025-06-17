/**
 * Script to manually clear and populate DynamoDB tables for e2e testing
 *
 * Usage:
 *   node -r esbuild-register e2e/scripts/setup-dynamodb.ts --clear     # Clear all tables
 *   node -r esbuild-register e2e/scripts/setup-dynamodb.ts --populate  # Populate tables with mock data
 *   node -r esbuild-register e2e/scripts/setup-dynamodb.ts             # Both clear and populate
 */

import { clearAllTables, insertAllMockData } from '../utils/dynamodb'

async function main() {
  const args = process.argv.slice(2)
  const shouldClear = args.includes('--clear') || args.length === 0
  const shouldPopulate = args.includes('--populate') || args.length === 0

  try {
    if (shouldClear) {
      console.log('Clearing all DynamoDB tables...')
      await clearAllTables()
      console.log('Tables cleared successfully')
    }

    if (shouldPopulate) {
      console.log('Populating DynamoDB tables with mock data...')
      await insertAllMockData()
      console.log('Tables populated successfully')
    }

    console.log('Done!')
    process.exit(0)
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

main()
