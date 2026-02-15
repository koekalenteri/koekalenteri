// Do this as the first thing so that any code reading it knows the right env.
process.env.BABEL_ENV = 'test'
process.env.NODE_ENV = 'test'
process.env.PUBLIC_URL = ''
process.env.REACT_APP_API_BASE_URL = ''
process.env.REACT_APP_WS_API_URL = ''
process.env.DOTENV_CONFIG_QUIET = 'true'

// Ensure environment variables are read.
require('../config/env')

const jest = require('jest')
const argv = process.argv.slice(2)

argv.push('--selectProjects=frontend')

// Allow filtered runs to succeed when no tests match.
if (argv.indexOf('--passWithNoTests') === -1) {
  argv.push('--passWithNoTests')
}

// Watch unless on CI or explicitly running all tests
if (!process.env.CI && argv.indexOf('--watchAll') === -1 && argv.indexOf('--watchAll=false') === -1) {
  argv.push('--watch')
}

jest.run(argv)
