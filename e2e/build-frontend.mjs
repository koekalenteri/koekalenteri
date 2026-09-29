/**
 * Builds the frontend the browser tests load: the production build, pointed at the local API and
 * written to `build-e2e` so it never replaces the deployable `build`.
 */
import { spawnSync } from 'node:child_process'
import { frontendBuildEnv } from './env.mjs'

const { status } = spawnSync(process.execPath, ['scripts/build-frontend.js'], {
  env: { ...process.env, ...frontendBuildEnv },
  stdio: 'inherit',
})
process.exit(status ?? 1)
