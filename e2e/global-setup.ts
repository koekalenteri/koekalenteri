/**
 * Before any test: the frontend build and the lambda bundles exist, and the tables exist with the
 * indexes the templates declare. Tables are created by the same script as for local development,
 * so the browser tests cannot run against a schema that differs from the deployed one.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { DYNAMODB_ENDPOINT, frontendBuildEnv } from './env.mjs'

const required = [
  ['dist/template.yaml', 'npm run build-backend'],
  [`${frontendBuildEnv.BUILD_PATH}/index.html`, 'npm run build-e2e-frontend'],
]

export default async function globalSetup() {
  const missing = required.filter(([file]) => !fs.existsSync(file))
  if (missing.length) {
    throw new Error(`Build first: ${missing.map(([file, command]) => `${command} (${file} is missing)`).join(', ')}`)
  }

  try {
    await fetch(DYNAMODB_ENDPOINT)
  } catch {
    throw new Error(
      `No DynamoDB at ${DYNAMODB_ENDPOINT}. Start one, e.g. docker run --rm -d -p 8000:8000 amazon/dynamodb-local, or set DYNAMODB_ENDPOINT.`
    )
  }

  const { status } = spawnSync(process.execPath, ['scripts/init-tables.mjs'], {
    env: { ...process.env, DYNAMODB_ENDPOINT },
    stdio: 'inherit',
  })
  if (status !== 0) throw new Error(`init-tables failed with ${status}`)
}
