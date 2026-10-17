/**
 * The DynamoDB-local the browser tests and the integration tests run against: where it is, whose
 * database a run uses, and the one way its tables come to exist, through the same script as for
 * local development (KOE-1345, KOE-1369).
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { DynamoDBClient, ListTablesCommand } from '@aws-sdk/client-dynamodb'

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
 * Whether the container keeps a database per access key: a key nobody has used sees no tables. One
 * started with -sharedDb (AWS's own docker-compose example, and what NoSQL Workbench or the AWS CLI
 * need to see the same tables) answers every key with the one database, so a reset under the
 * integration key would empty the developer's tables there.
 */
const isolatesAccessKeys = async (endpoint) => {
  // Letters and digits only: DynamoDB-local answers a key with a hyphen in it with "invalid".
  const probeKey = `probe${randomUUID().replaceAll('-', '')}`
  const client = new DynamoDBClient({
    credentials: { accessKeyId: probeKey, secretAccessKey: probeKey },
    endpoint,
    region: 'eu-north-1',
  })
  try {
    const { TableNames = [] } = await client.send(new ListTablesCommand({ Limit: 1 }))
    return TableNames.length === 0
  } finally {
    client.destroy()
  }
}

/**
 * Checks that a DynamoDB answers at the endpoint, for a readable error instead of a timeout deep in
 * the SDK, then runs `scripts/init-tables.mjs` with the given arguments under the given access key.
 * A reset empties a whole database, so this runs one only under the integration tests' own key, and
 * only where that key has a database of its own: whatever the caller's environment holds and however
 * the container was started, the developer's tables are never the ones dropped.
 *
 * `root` is the repository root, which the test runners know (vitest's `project.config.root`,
 * Playwright's `config.rootDir`): the script and the templates it reads are found from there, so the
 * setups work wherever the runner was started. (Playwright loads this module as CommonJS, so the
 * module cannot locate itself through `import.meta`.)
 */
export const ensureLocalTables = async ({
  accessKey = LOCAL_ACCESS_KEY,
  args = [],
  endpoint = DYNAMODB_ENDPOINT,
  root = process.cwd(),
} = {}) => {
  const reset = args.includes('--reset')
  if (reset && accessKey !== INTEGRATION_ACCESS_KEY) {
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

  if (reset && !(await isolatesAccessKeys(endpoint))) {
    throw new Error(
      `Refusing to reset the tables at ${endpoint}: the container shares one database between access keys (-sharedDb), so the reset would empty the developer's tables. Start one without -sharedDb, e.g. npm run init-dynamodb, or point DYNAMODB_ENDPOINT at it.`
    )
  }

  const { status } = spawnSync(process.execPath, ['scripts/init-tables.mjs', ...args], {
    cwd: root,
    env: { ...process.env, DYNAMODB_ENDPOINT: endpoint, DYNAMODB_LOCAL_ACCESS_KEY: accessKey },
    stdio: 'inherit',
  })
  if (status !== 0) throw new Error(`init-tables failed with ${status}`)
}
