/**
 * Setup E2E Environment
 *
 * This script sets up the complete environment for E2E testing:
 * - DynamoDB
 * - SAM Local API (Backend)
 * - Frontend server
 * - Nginx
 * - Cloudflared tunnel
 *
 * It can be used both locally and in CI environments.
 */

const { spawn, execSync } = require('child_process')
const waitOn = require('wait-on')
const { startNginx, startCloudflared, getTunnelUrls, stopServices } = require('./cloudflared-nginx-manager')

// Store process references for cleanup
let samProcess = null
let frontendProcess = null

/**
 * Setup the E2E environment
 * @param {boolean} isCI - Whether running in CI environment
 * @returns {Promise<Object>} - URLs and other information about the setup
 */
async function setupE2EEnvironment(isCI = false) {
  console.log(`Setting up E2E environment${isCI ? ' in CI mode' : ''}...`)
  try {
    // Create Docker network if it doesn't exist
    try {
      execSync('docker network inspect koekalenteri >/dev/null 2>&1 || docker network create koekalenteri')
      console.log('✅ Docker network "koekalenteri" is ready')
    } catch (error) {
      console.error('❌ Failed to create Docker network:', error.message)
      throw error
    }

    await setupDynamoDB(isCI)
    await Promise.all([startBackend(isCI), startFrontend(isCI)])
    await waitForServices()

    const nginxStarted = await startNginx()
    if (!nginxStarted) {
      throw new Error('Failed to start nginx')
    }

    await startCloudflared()

    console.log('🎉 E2E environment setup complete!')
  } catch (error) {
    console.error('❌ Failed to setup E2E environment:', error)
    await cleanup()
    throw error
  }
}

/**
 * Setup DynamoDB
 * @param {boolean} isCI - Whether running in CI environment
 */
async function setupDynamoDB(isCI) {
  console.log('Setting up DynamoDB...')

  if (!isCI) {
    // Start DynamoDB locally (not needed in CI as it's a service)
    try {
      execSync('npm run dynamodb:start', { stdio: 'inherit' })
      console.log('✅ DynamoDB started successfully')
    } catch (error) {
      console.error('❌ Failed to start DynamoDB:', error.message)
      throw error
    }
  }

  // Create tables
  try {
    console.log('Creating DynamoDB tables...')
    execSync('python scripts/create-local-tables.py', { stdio: 'inherit' })
    console.log('✅ DynamoDB tables created successfully')
  } catch (error) {
    console.error('❌ Failed to create DynamoDB tables:', error.message)
    throw error
  }

  // Setup test data
  try {
    console.log('Setting up E2E test data...')
    execSync('node -r esbuild-register e2e/scripts/setup-dynamodb.ts', { stdio: 'inherit' })
    console.log('✅ E2E test data loaded successfully')
  } catch (error) {
    console.error('❌ Failed to setup E2E test data:', error.message)
    throw error
  }
}

/**
 * Start the backend (SAM Local API)
 * @param {boolean} isCI - Whether running in CI environment
 */
async function startBackend(isCI) {
  console.log('Starting SAM local API...')

  return new Promise((resolve, reject) => {
    const samPort = process.env.SAM_PORT || 8080

    const args = [
      'local',
      'start-api',
      '-p',
      samPort,
      '--docker-network',
      'koekalenteri',
      '--warm-containers=EAGER',
      '--parameter-overrides',
      'UseCloudflaredParam=true',
    ]

    samProcess = spawn('sam', args, {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: './dist', // Run in the dist folder
    })

    samProcess.on('error', (error) => {
      console.error('❌ Failed to start SAM local API:', error)
      reject(error)
    })

    // Don't wait for SAM to fully start here, we'll use wait-on for that
    resolve()
  })
}

/**
 * Start the frontend server
 * @param {boolean} isCI - Whether running in CI environment
 */
async function startFrontend(isCI) {
  console.log('Starting frontend...')

  return new Promise((resolve, reject) => {
    const frontendPort = process.env.FRONTEND_PORT || 3000

    if (isCI) {
      // In CI, use a simple static server
      frontendProcess = spawn('npx', ['serve', '-s', 'build', '-l', frontendPort], {
        stdio: 'inherit',
        env: { ...process.env, BROWSER: 'none' },
      })
    } else {
      // In local development, use the start-frontend script
      frontendProcess = spawn('npm', ['run', 'start-frontend'], {
        stdio: 'inherit',
        env: { ...process.env, BROWSER: 'none' },
      })
    }

    frontendProcess.on('error', (error) => {
      console.error('❌ Failed to start frontend:', error)
      reject(error)
    })

    // Don't wait for frontend to fully start here, we'll use wait-on for that
    resolve()
  })
}

/**
 * Wait for backend and frontend services to be ready
 */
async function waitForServices() {
  console.log('Waiting for services to be ready...')

  const samPort = process.env.SAM_PORT || 8080
  const frontendPort = process.env.FRONTEND_PORT || 3000

  const opts = {
    resources: [
      `http://localhost:${samPort}`, // Backend
      `http://localhost:${frontendPort}`, // Frontend
    ],
    delay: 1000, // Initial delay
    interval: 2000, // Poll interval
    timeout: 60000, // 60 second timeout
    validateStatus: (status) => status !== 500, // Accept any status except 500
  }

  try {
    await waitOn(opts)
    console.log('✅ All services are ready!')
  } catch (error) {
    console.error('❌ Services failed to start within timeout:', error)
    throw error
  }
}

/**
 * Cleanup all resources
 */
async function cleanup() {
  console.log('Cleaning up resources...')

  // Stop frontend process
  if (frontendProcess) {
    console.log('Stopping frontend...')
    frontendProcess.kill()
    frontendProcess = null
  }

  // Stop SAM process
  if (samProcess) {
    console.log('Stopping SAM local API...')
    samProcess.kill()
    samProcess = null
  }

  // Stop nginx and cloudflared
  await stopServices()

  // Stop DynamoDB if not in CI
  if (!process.env.CI) {
    console.log('Stopping DynamoDB...')
    try {
      execSync('npm run dynamodb:stop', { stdio: 'inherit' })
      console.log('✅ DynamoDB stopped successfully')
    } catch (error) {
      console.error('❌ Error stopping DynamoDB:', error.message)
    }
  }

  console.log('✅ Cleanup complete')
}

// Handle process termination
process.on('SIGINT', async () => {
  await cleanup()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await cleanup()
  process.exit(0)
})

// Export functions for use in other scripts
module.exports = {
  setupE2EEnvironment,
  cleanup,
}

// If this script is run directly, setup the environment
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2)
  const isCI = args.includes('--ci')

  setupE2EEnvironment(isCI)
    .then(() => {
      console.log('E2E environment is ready!')
      console.log('Press Ctrl+C to stop.')
    })
    .catch((error) => {
      console.error('Failed to setup E2E environment:', error)
      process.exit(1)
    })
}
