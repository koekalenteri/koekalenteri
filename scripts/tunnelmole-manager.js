/**
 * Tunnelmole Manager for Frontend and Backend Tunnels
 *
 * This script manages tunnelmole tunnels for both frontend and backend in development.
 * It starts two separate tunnels and provides the public URLs to the application.
 */

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

// Default ports
const BACKEND_PORT = parseInt(process.env.SAM_PORT, 10) || 8080
const FRONTEND_PORT = parseInt(process.env.FRONTEND_PORT, 10) || 3000

// Files to store the tunnel URLs (in layer/nodejs so Lambda can access them)
const BACKEND_URL_FILE = path.join(__dirname, '../dist/layer/nodejs/.backend-tunnel-url')
const FRONTEND_URL_FILE = path.join(__dirname, '../dist/layer/nodejs/.frontend-tunnel-url')

// Store tunnel processes
let backendTunnelProcess = null
let frontendTunnelProcess = null

/**
 * Start a tunnelmole tunnel for a specific port
 */
async function startTunnel(port, name) {
  return new Promise((resolve, reject) => {
    console.log(`Starting ${name} tunnel on port ${port}...`)

    const tunnelProcess = spawn('tunnelmole', [port.toString()], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let tunnelUrl = null
    let errorOutput = ''

    tunnelProcess.stdout.on('data', (data) => {
      const output = data.toString()
      console.log(`${name} tunnel output:`, output)

      // Look for the tunnel URL in the output
      const urlMatch = output.match(/https?:\/\/[^\s]+/)
      if (urlMatch && !tunnelUrl) {
        tunnelUrl = urlMatch[0].trim()
        console.log(`🚀 ${name} tunnel started: ${tunnelUrl}`)
        resolve({ process: tunnelProcess, url: tunnelUrl })
      }
    })

    tunnelProcess.stderr.on('data', (data) => {
      errorOutput += data.toString()
      console.error(`${name} tunnel error:`, data.toString())
    })

    tunnelProcess.on('error', (error) => {
      console.error(`Failed to start ${name} tunnel:`, error)
      reject(error)
    })

    tunnelProcess.on('exit', (code) => {
      if (code !== 0 && !tunnelUrl) {
        console.error(`${name} tunnel exited with code ${code}`)
        console.error('Error output:', errorOutput)
        reject(new Error(`Tunnel process exited with code ${code}`))
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!tunnelUrl) {
        tunnelProcess.kill()
        reject(new Error(`Timeout waiting for ${name} tunnel to start`))
      }
    }, 30000)
  })
}

/**
 * Start both frontend and backend tunnels
 */
async function startTunnels() {
  try {
    console.log('Starting tunnelmole tunnels...')

    // Kill any existing tunnel processes
    await stopTunnels()

    // Start backend tunnel
    try {
      const backendResult = await startTunnel(BACKEND_PORT, 'Backend')
      backendTunnelProcess = backendResult.process
      const backendUrl = backendResult.url

      // Ensure the directory exists
      const layerDir = path.dirname(BACKEND_URL_FILE)
      if (!fs.existsSync(layerDir)) {
        fs.mkdirSync(layerDir, { recursive: true })
      }

      // Save the backend URL to a file
      fs.writeFileSync(BACKEND_URL_FILE, backendUrl)
      console.log('Backend tunnel URL saved for Paytrail callbacks')

      // Set environment variable
      process.env.BACKEND_TUNNEL_URL = backendUrl
    } catch (error) {
      console.error('Failed to start backend tunnel:', error)
      console.log('Backend tunnel will not be available')
    }

    // Start frontend tunnel
    try {
      const frontendResult = await startTunnel(FRONTEND_PORT, 'Frontend')
      frontendTunnelProcess = frontendResult.process
      const frontendUrl = frontendResult.url

      // Save the frontend URL to a file
      fs.writeFileSync(FRONTEND_URL_FILE, frontendUrl)
      console.log('Frontend tunnel URL saved')

      // Set environment variable
      process.env.FRONTEND_TUNNEL_URL = frontendUrl
    } catch (error) {
      console.error('Failed to start frontend tunnel:', error)
      console.log('Frontend tunnel will not be available')
    }

    return {
      backend: process.env.BACKEND_TUNNEL_URL,
      frontend: process.env.FRONTEND_TUNNEL_URL,
    }
  } catch (error) {
    console.error('Failed to start tunnels:', error)
    console.log('\nTroubleshooting tips:')
    console.log('1. Make sure tunnelmole is properly installed: npm install tunnelmole --save-dev')
    console.log('2. Check if the ports are available and not blocked by firewall')
    console.log('3. Try running tunnelmole directly: npx tunnelmole 8080')

    // Return fallback URLs for development
    const backendFallback = `http://localhost:${BACKEND_PORT}`
    const frontendFallback = `http://localhost:${FRONTEND_PORT}`
    console.log(`\nUsing fallback URLs:`)
    console.log(`Backend: ${backendFallback}`)
    console.log(`Frontend: ${frontendFallback}`)
    console.log('Note: External access and Paytrail callbacks will not work with these URLs')

    return {
      backend: backendFallback,
      frontend: frontendFallback,
    }
  }
}

/**
 * Get the current tunnel URLs
 */
function getTunnelUrls() {
  const urls = {}

  try {
    if (fs.existsSync(BACKEND_URL_FILE)) {
      urls.backend = fs.readFileSync(BACKEND_URL_FILE, 'utf8').trim()
    }
  } catch (error) {
    console.error('Failed to read backend tunnel URL:', error)
  }

  try {
    if (fs.existsSync(FRONTEND_URL_FILE)) {
      urls.frontend = fs.readFileSync(FRONTEND_URL_FILE, 'utf8').trim()
    }
  } catch (error) {
    console.error('Failed to read frontend tunnel URL:', error)
  }

  return urls
}

/**
 * Stop all tunnels
 */
async function stopTunnels() {
  try {
    if (backendTunnelProcess) {
      console.log('Stopping backend tunnel...')
      backendTunnelProcess.kill()
      backendTunnelProcess = null
    }

    if (frontendTunnelProcess) {
      console.log('Stopping frontend tunnel...')
      frontendTunnelProcess.kill()
      frontendTunnelProcess = null
    }

    console.log('Tunnels stopped')

    // Remove the URL files
    if (fs.existsSync(BACKEND_URL_FILE)) {
      fs.unlinkSync(BACKEND_URL_FILE)
    }
    if (fs.existsSync(FRONTEND_URL_FILE)) {
      fs.unlinkSync(FRONTEND_URL_FILE)
    }
  } catch (error) {
    console.error('Failed to stop tunnels:', error)
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await stopTunnels()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stopTunnels()
  process.exit(0)
})

module.exports = {
  startTunnels,
  getTunnelUrls,
  stopTunnels,
}

// If this script is run directly, start tunnels
if (require.main === module) {
  startTunnels()
    .then((urls) => {
      console.log('Tunnels are running:')
      console.log(`Backend: ${urls.backend}`)
      console.log(`Frontend: ${urls.frontend}`)
      console.log('Press Ctrl+C to stop.')
    })
    .catch((error) => {
      console.error('Failed to start tunnels:', error)
      process.exit(1)
    })
}
