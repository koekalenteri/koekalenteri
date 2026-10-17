/**
 * Before the integration tests: the tables exist, empty, with the keys and indexes the templates
 * declare. They are created by the same script as for local development and the browser tests, so
 * a query that names an index or a key the template does not have fails here, not in production
 * (KOE-1369). The reset is safe because `scripts/test-integration.js` runs this under an access
 * key of the tests' own.
 */
import { spawnSync } from 'node:child_process'

const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://127.0.0.1:8000'

export default async function globalSetup() {
  try {
    await fetch(endpoint)
  } catch {
    throw new Error(
      `No DynamoDB at ${endpoint}. Start one, e.g. npm run init-dynamodb, or docker run --rm -d -p 8000:8000 amazon/dynamodb-local, or set DYNAMODB_ENDPOINT.`
    )
  }

  const { status } = spawnSync(process.execPath, ['scripts/init-tables.mjs', '--reset', '--no-seed'], {
    env: { ...process.env, DYNAMODB_ENDPOINT: endpoint },
    stdio: 'inherit',
  })
  if (status !== 0) throw new Error(`init-tables failed with ${status}`)
}
