/**
 * Start SAM Local API with Ngrok
 *
 * This script starts the SAM local API and ngrok tunnel for Paytrail callbacks.
 * It runs SAM directly in the dist folder with eager containers.
 */

const { spawn, execSync } = require('child_process')
const { startNgrok } = require('./ngrok-manager')

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
    // Stop DynamoDB
    /*
    console.log('Stopping DynamoDB...')
    execSync('npm run dynamodb:stop', { stdio: 'inherit' })
    console.log('DynamoDB stopped successfully')
    */
  } catch (error) {
    console.error('Error stopping DynamoDB:', error)
  }
  process.exit(exitCode)
}

async function main() {
  try {
    // Start DynamoDB first
    await startDynamoDB()

    // Start ngrok
    console.log('Starting ngrok tunnel...')
    let ngrokUrl
    try {
      ngrokUrl = await startNgrok()
      // Set the ngrok URL as an environment variable
      process.env.NGROK_URL = ngrokUrl
      console.log(`Ngrok URL: ${ngrokUrl}`)
    } catch (error) {
      console.warn('Failed to start ngrok, continuing without it')
      console.warn('Paytrail callbacks will not work properly')
    }

    console.log('Starting SAM local API with eager containers...')

    // Start the SAM local API in the dist folder with lazy containers
    const samProcess = spawn(
      'sam',
      ['local', 'start-api', '-p', '8080', '--docker-network', 'koekalenteri', '--warm-containers=LAZY'],
      {
        stdio: 'inherit',
        env: { ...process.env },
        cwd: './dist', // Run in the dist folder
      }
    )

    // Wait for SAM to start
    console.log('Waiting for SAM local API to start...')
    await new Promise((resolve) => setTimeout(resolve, 8_000))

    // Warm up important functions
    console.log('Warming up important functions...')
    await warmUpFunctions()

    // Handle SAM local API exit
    samProcess.on('exit', (code) => {
      console.log(`SAM local API exited with code ${code}`)
      cleanup(code)
    })

    // Set up cleanup on process termination
    process.on('SIGINT', () => cleanup(0))
    process.on('SIGTERM', () => cleanup(0))
  } catch (error) {
    console.error('Failed to start SAM local API with ngrok:', error)
    cleanup(1)
  }
}

main()
