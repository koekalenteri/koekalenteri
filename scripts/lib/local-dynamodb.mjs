/**
 * The DynamoDB-local the browser tests and the integration tests run against: where it is, whose
 * database a run uses, and the one way its tables come to exist, through the same script as for
 * local development (KOE-1345, KOE-1369).
 */
import { spawnSync } from 'node:child_process'

export const DYNAMODB_ENDPOINT = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'

/**
 * DynamoDB-local keeps one database per access key (unless started with -sharedDb, which a CI
 * service container cannot be). `local` is the developer's, created by `npm run init` and read by
 * the browser tests; the integration tests have one of their own, which their setup empties on
 * every run.
 */
export const LOCAL_ACCESS_KEY = 'local'
export const INTEGRATION_ACCESS_KEY = 'integration'

/**
 * Checks that a DynamoDB answers at the endpoint, for a readable error instead of a timeout deep in
 * the SDK, then runs `scripts/init-tables.mjs` with the given arguments under the given access key.
 * A reset empties a whole database, so this runs one only under the integration tests' own key:
 * whatever the caller's environment holds, the developer's tables are never the ones dropped.
 */
export const ensureLocalTables = async ({ accessKey = LOCAL_ACCESS_KEY, args = [], endpoint = DYNAMODB_ENDPOINT } = {}) => {
  if (args.includes('--reset') && accessKey !== INTEGRATION_ACCESS_KEY) {
    throw new Error(
      `Refusing to reset the tables under access key ${accessKey}: a test run empties only the integration tests' own database (${INTEGRATION_ACCESS_KEY}).`
    )
  }

  try {
    await fetch(endpoint)
  } catch {
    throw new Error(
      `No DynamoDB at ${endpoint}. Start one, e.g. npm run init-dynamodb, or docker run --rm -d -p 8000:8000 amazon/dynamodb-local, or set DYNAMODB_ENDPOINT.`
    )
  }

  const { status } = spawnSync(process.execPath, ['scripts/init-tables.mjs', ...args], {
    env: { ...process.env, DYNAMODB_ENDPOINT: endpoint, DYNAMODB_LOCAL_ACCESS_KEY: accessKey },
    stdio: 'inherit',
  })
  if (status !== 0) throw new Error(`init-tables failed with ${status}`)
}
