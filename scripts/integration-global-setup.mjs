/**
 * Before the integration tests: the tables exist, empty, with the keys and indexes the templates
 * declare. They are created by the same script as for local development and the browser tests, so
 * a query that names an index or a key the template does not have fails here, not in production
 * (KOE-1369). The reset runs under the integration tests' own access key, set here and nowhere
 * else, so however this setup is reached the developer's tables stay as they are.
 */
import { ensureLocalTables, INTEGRATION_ACCESS_KEY } from './lib/local-dynamodb.mjs'

/** @param {import('vitest/node').TestProject} project */
export default async function globalSetup(project) {
  // The tests reach the same database only when they run under the same key, which
  // scripts/test-integration.js sets along with the endpoint and the table names.
  if (process.env.AWS_ACCESS_KEY_ID !== INTEGRATION_ACCESS_KEY) {
    throw new Error('The integration tests run through `npm run test-integration`, which sets their environment.')
  }

  await ensureLocalTables({
    accessKey: INTEGRATION_ACCESS_KEY,
    args: ['--reset', '--no-seed'],
    root: project.config.root,
  })
}
