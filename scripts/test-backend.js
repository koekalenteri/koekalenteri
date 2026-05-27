// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'test'
process.env.NODE_ENV = 'test'
process.env.DOTENV_CONFIG_QUIET = 'true'

const { spawnSync } = require('node:child_process')

const requiredNodeOptions = ['--experimental-vm-modules', '--no-warnings']
const nodeOptions = process.env.NODE_OPTIONS ?? ''
const missingNodeOptions = requiredNodeOptions.filter((option) => !nodeOptions.includes(option))

// These Node flags are read only during process startup. Setting NODE_OPTIONS
// below would be too late for Jest's ESM support, so re-run this script once
// with the required flags when it was launched directly without them.
if (missingNodeOptions.length) {
  const result = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: [nodeOptions, ...missingNodeOptions].filter(Boolean).join(' '),
    },
  })

  process.exit(result.status ?? (result.signal ? 1 : 0))
}

process.env.NODE_OPTIONS = nodeOptions

// Ensure environment variables are read.
require('../config/env')

const jest = require('jest')
const argv = process.argv.slice(2)
argv.push('--selectProjects=backend')

// Allow filtered runs to succeed when no tests match.
if (argv.indexOf('--passWithNoTests') === -1) {
  argv.push('--passWithNoTests')
}

// Watch unless on CI or explicitly running all tests
if (
  !process.env.CI &&
  argv.indexOf('--watchAll') === -1 &&
  argv.indexOf('--watchAll=false') === -1 &&
  argv.indexOf('--watch=false') === -1
) {
  argv.push('--watch')
}

jest.run(argv)
