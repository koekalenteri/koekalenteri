/**
 * The DynamoDB-local the browser tests and the integration tests run against: where it is, whose
 * database a run uses, and the one way its tables come to exist, through the same script as for
 * local development (KOE-1345, KOE-1369).
 */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { CreateTableCommand, DeleteTableCommand, DescribeTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'

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
 * The two keys the isolation probe uses, fixed so that a container started with -dbPath gets two
 * probe files once and not one per run. Letters and digits only: DynamoDB-local answers a key with
 * a hyphen in it with "invalid".
 */
const PROBE_KEYS = ['isolationprobe1', 'isolationprobe2']

const probeClient = (endpoint, key) =>
  new DynamoDBClient({ credentials: { accessKeyId: key, secretAccessKey: key }, endpoint, region: 'eu-north-1' })

/**
 * Whether the container keeps a database per access key: a table created under one key is not seen
 * under another. One started with -sharedDb (AWS's own docker-compose example, and what NoSQL
 * Workbench or the AWS CLI need to see the same tables) answers every key with the one database, so
 * a reset under the integration key would empty the developer's tables there. A marker table rather
 * than a look at what is there, so an empty shared database reads as shared too; the marker's name
 * is this probe's own, so a probe running beside it, or a table of the developer's, is neither
 * mistaken for it nor deleted with it, and it is asked for by name rather than looked for in a
 * table list that stops at a hundred names.
 */
const isolatesAccessKeys = async (endpoint) => {
  const marker = `isolation-probe-${randomUUID()}`
  const [writer, reader] = PROBE_KEYS.map((key) => probeClient(endpoint, key))
  let created = false
  try {
    await writer.send(
      new CreateTableCommand({
        AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
        TableName: marker,
      })
    )
    created = true
    try {
      await reader.send(new DescribeTableCommand({ TableName: marker }))
      return false
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') return true
      throw error
    }
  } finally {
    // Only what this probe made, and only under the key that made it
    if (created) await writer.send(new DeleteTableCommand({ TableName: marker }))
    writer.destroy()
    reader.destroy()
  }
}

/**
 * Checks that a DynamoDB answers at the endpoint, for a readable error instead of a timeout deep in
 * the SDK, then runs `scripts/init-tables.mjs` with the given arguments under the given access key.
 * A reset empties a whole database, so this runs one only under the integration tests' own key, and
 * only where that key has a database of its own: whatever the caller's environment holds and however
 * the container was started, the developer's tables are never the ones dropped.
 *
 * `root` is the repository root, which the test runners know (vitest's `project.config.root`; for
 * Playwright the directory of `config.configFile`, since its `rootDir` is the test directory): the
 * script and the templates it reads are found from there, so the setups work wherever the runner
 * was started. (Playwright loads this module as CommonJS, so the module cannot locate itself through
 * `import.meta`.)
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

  if (reset) {
    if (!(await isolatesAccessKeys(endpoint))) {
      throw new Error(
        `Refusing to reset the tables at ${endpoint}: the container shares one database between access keys (-sharedDb), so the reset would empty the developer's tables. Start one without -sharedDb, e.g. npm run init-dynamodb, or point DYNAMODB_ENDPOINT at it.`
      )
    }
    console.log(`DynamoDB at ${endpoint} keeps a database per access key; resetting the tables under key ${accessKey}`)
  }

  const { status } = spawnSync(process.execPath, ['scripts/init-tables.mjs', ...args], {
    cwd: root,
    env: { ...process.env, DYNAMODB_ENDPOINT: endpoint, DYNAMODB_LOCAL_ACCESS_KEY: accessKey },
    stdio: 'inherit',
  })
  if (status !== 0) throw new Error(`init-tables failed with ${status}`)
}
