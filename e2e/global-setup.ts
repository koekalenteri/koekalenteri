/**
 * Before any test: the frontend build and the lambda bundles exist, and the tables exist with the
 * indexes the templates declare. Tables are created by the same script as for local development,
 * so the browser tests cannot run against a schema that differs from the deployed one.
 */
import fs from 'node:fs'
import { ensureLocalTables } from '../scripts/lib/local-dynamodb.mjs'
import { frontendBuildEnv } from './env.mjs'

const required = [
  ['dist/template.yaml', 'npm run build-backend'],
  [`${frontendBuildEnv.BUILD_PATH}/index.html`, 'npm run build-e2e-frontend'],
]

export default async function globalSetup() {
  const missing = required.filter(([file]) => !fs.existsSync(file))
  if (missing.length) {
    throw new Error(`Build first: ${missing.map(([file, command]) => `${command} (${file} is missing)`).join(', ')}`)
  }

  await ensureLocalTables()
}
