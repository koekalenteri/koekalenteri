/**
 * Start SAM Local API and Frontend with Tunnelmole
 *
 * This script starts both the SAM local API and frontend, waits for them to be ready,
 * then creates tunnelmole tunnels for both services.
 */

const { spawn, execSync } = require('child_process')
const waitOn = require('wait-on')
const { startTunnels } = require('./tunnelmole-manager')

// Store process references for cleanup
let samProcess = null
let frontendProcess = null

async function startDynamoDB() {
  console.log('Starting DynamoDB...')
  try {
    execSync('npm run dynamodb:start', { stdio: 'inherit' })
    console.log('DynamoDB started successfully')

    console.log('Seeding DynamoDB...')
    execSync('npm run dynamodb:seed', { stdio: 'inherit' })
    console.log('DynamoDB seeded successfully')

    console.log('Setting up e2e test fixtures...')
    execSync('npm run test-e2e:setup-db', { stdio: 'inherit' })
    console.log('E2E test fixtures loaded successfully')

    return true
  } catch (error) {
    console.error('Failed to start or seed DynamoDB:', error)
    return false
  }
}

async function startBackend() {
  console.log('Starting SAM local API...')

  return new Promise((resolve, reject) => {
    samProcess = spawn(
      'sam',
      [
        'local',
        'start-api',
        '-p',
        '8080',
        '--docker-network',
        'koekalenteri',
        '--warm-containers=LAZY',
        '--parameter-overrides',
        'UseTunnelmoleParam=true',
      ],
      {
        stdio: 'inherit',
        env: { ...process.env },
        cwd: './dist', // Run in the dist folder
      }
    )

    samProcess.on('error', (error) => {
      console.error('Failed to start SAM local API:', error)
      reject(error)
    })

    // Don't wait for SAM to fully start here, we'll use wait-on for that
    resolve()
  })
}

async function startFrontend() {
  console.log('Starting frontend...')

  return new Promise((resolve, reject) => {
    frontendProcess = spawn('npm', ['run', 'start-frontend'], {
      stdio: 'inherit',
      env: { ...process.env },
    })

    frontendProcess.on('error', (error) => {
      console.error('Failed to start frontend:', error)
      reject(error)
    })

    // Don't wait for frontend to fully start here, we'll use wait-on for that
    resolve()
  })
}

async function waitForServices() {
  console.log('Waiting for backend and frontend services to be ready...')

  const opts = {
    resources: [
      'http://localhost:8080', // Backend
      'https://localhost:3000/notfound', // Frontend
    ],
    delay: 1000, // Initial delay
    interval: 2000, // Poll interval
    timeout: 60000, // 60 second timeout
    window: 1000, // Stability window
    validateStatus: (status) => status === 403 || status === 404,
  }

  try {
    await waitOn(opts)
    console.log('✅ Both services are ready!')
  } catch (error) {
    console.error('❌ Services failed to start within timeout:', error)
    throw error
  }
}

// Function to warm up important Lambda functions by making actual HTTP requests
async function warmUpFunctions() {
  try {
    console.log('Warming up lambda functions via HTTP requests...')

    const endpointsToWarmUp = [
      // GET endpoints
      { name: 'GetEventsFunction', method: 'GET', path: 'event' },
      { name: 'GetEventFunction', method: 'GET', path: 'event/1' },
      { name: 'GetDogFunction', method: 'GET', path: 'dog/12345' },
      { name: 'GetRegistrationFunction', method: 'GET', path: 'registration/1/1' },
      { name: 'PaymentCancelFunction', method: 'GET', path: 'payment/cancel' },
      { name: 'PaymentSuccessFunction', method: 'GET', path: 'payment/success' },

      // POST endpoints
      { name: 'PutRegistrationFunction', method: 'POST', path: 'registration' },
      { name: 'PaymentCreateFunction', method: 'POST', path: 'payment/create' },
      { name: 'PaymentVerifyFunction', method: 'POST', path: 'payment/verify' },
    ]

    // Warm up each endpoint with curl
    for (const endpoint of endpointsToWarmUp) {
      console.log(`Warming up ${endpoint.name} via ${endpoint.method} request to /${endpoint.path}...`)
      try {
        let curlCommand = ''

        if (endpoint.method === 'GET') {
          // GET request
          curlCommand = `curl -s -o /dev/null -w "Status: %{http_code}\\n" http://localhost:8080/${endpoint.path}`
        } else {
          // POST request with empty JSON body
          curlCommand = `curl -s -o /dev/null -w "Status: %{http_code}\\n" -X POST -H "Content-Type: application/json" -d '{}' http://localhost:8080/${endpoint.path}`
        }

        execSync(curlCommand, {
          stdio: 'inherit',
        })
      } catch (error) {
        // If one endpoint fails, continue with others
        console.warn(`Error warming up ${endpoint.name}: ${error.message}`)
      }
    }

    console.log('Function warm-up complete')
  } catch (error) {
    console.warn('Error warming up functions:', error.message)
    console.warn('Continuing anyway...')
  }
}

// Function to clean up resources before exiting
function cleanup(exitCode) {
  console.log('Cleaning up resources...')
  try {
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

    // Stop DynamoDB
    /*
    console.log('Stopping DynamoDB...')
    execSync('npm run dynamodb:stop', { stdio: 'inherit' })
    console.log('DynamoDB stopped successfully')
    */
  } catch (error) {
    console.error('Error during cleanup:', error)
  }
  process.exit(exitCode)
}

async function main() {
  try {
    // Start DynamoDB first
    await startDynamoDB()

    // Start backend and frontend services
    await startBackend()
    await startFrontend()

    // Wait for both services to be ready
    await waitForServices()

    // Now start tunnelmole tunnels after services are ready
    console.log('Starting tunnelmole tunnels...')
    let tunnelUrls
    try {
      tunnelUrls = await startTunnels()

      // Set the tunnel URLs as environment variables
      if (tunnelUrls.backend) {
        process.env.BACKEND_TUNNEL_URL = tunnelUrls.backend
        console.log(`Backend tunnel URL: ${tunnelUrls.backend}`)
      }

      if (tunnelUrls.frontend) {
        process.env.FRONTEND_TUNNEL_URL = tunnelUrls.frontend
        console.log(`Frontend tunnel URL: ${tunnelUrls.frontend}`)
      }

      console.log('🎉 Tunnels are ready!')
    } catch (error) {
      console.warn('Failed to start tunnelmole, continuing without it')
      console.warn('External access and Paytrail callbacks will not work properly')
    }

    // Warm up important functions AFTER tunnel files are written
    console.log('Warming up important functions...')
    await warmUpFunctions()

    console.log('🎉 All services and tunnels are ready!')

    // Handle process exits
    if (samProcess) {
      samProcess.on('exit', (code) => {
        console.log(`SAM local API exited with code ${code}`)
        cleanup(code)
      })
    }

    if (frontendProcess) {
      frontendProcess.on('exit', (code) => {
        console.log(`Frontend exited with code ${code}`)
        cleanup(code)
      })
    }

    // Set up cleanup on process termination
    process.on('SIGINT', () => cleanup(0))
    process.on('SIGTERM', () => cleanup(0))
  } catch (error) {
    console.error('Failed to start services with tunnelmole:', error)
    cleanup(1)
  }
}

main()
