// Runs the `integration` Vitest project: the database layer against a DynamoDB-local
// (`npm run init-dynamodb`, or DYNAMODB_ENDPOINT for one elsewhere). The tables are created from
// `template/tables` by the project's global setup, under an access key of the tests' own, so the
// developer's `npm run init` tables and the browser tests' rows are never touched (KOE-1369).
//
// Never part of `npm test` or the pre-commit hook: it needs a running container.

// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'test'
process.env.NODE_ENV = 'test'
process.env.DOTENV_CONFIG_QUIET = 'true'

// Ensure environment variables are read.
require('../config/env')

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const ACCESS_KEY = 'integration'

const main = async () => {
  const { DYNAMODB_ENDPOINT, tableEnv } = await import('../e2e/env.mjs')
  const argv = process.argv.slice(2)
  if (!argv.includes('--run')) argv.push('--run')

  const env = {
    ...process.env,
    ...tableEnv,
    // DynamoDB-local keeps one database per access key; the global setup resets this one.
    AWS_ACCESS_KEY_ID: ACCESS_KEY,
    // The lambda wrapper's metrics: without an environment named, the detector probes EC2 metadata.
    AWS_EMF_ENVIRONMENT: 'Local',
    // The SDK's own variable, read by every DynamoDBClient the lambda code constructs.
    AWS_ENDPOINT_URL_DYNAMODB: DYNAMODB_ENDPOINT,
    AWS_REGION: 'eu-north-1',
    AWS_SECRET_ACCESS_KEY: ACCESS_KEY,
    DYNAMODB_ENDPOINT,
    DYNAMODB_LOCAL_ACCESS_KEY: ACCESS_KEY,
  }

  const vitestCli = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
  const result = spawnSync(process.execPath, [vitestCli, '--project=integration', ...argv], {
    env,
    stdio: 'inherit',
  })

  process.exit(result.status ?? (result.signal ? 1 : 0))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
