/**
 * Ngrok + Nginx Manager
 *
 * This script manages a single ngrok tunnel and nginx for both frontend and backend.
 * It routes /api to backend and everything else to frontend through nginx.
 */

const ngrok = require('ngrok')
const fs = require('fs')
const path = require('path')
const { spawn, execSync, exec } = require('child_process')

// Default port for nginx (using 8888 to avoid collision with DynamoDB on 8000)
const NGINX_PORT = parseInt(process.env.NGINX_PORT, 10) || 8888

// Files to store the tunnel URLs (in layer/nodejs so Lambda can access them)
const BACKEND_URL_FILE = path.join(__dirname, '../dist/layer/nodejs/.backend-tunnel-url')
const FRONTEND_URL_FILE = path.join(__dirname, '../dist/layer/nodejs/.frontend-tunnel-url')

// Store nginx process
let nginxProcess = null

/**
 * Start nginx with Docker
 */
async function startNginx() {
  try {
    console.log('Starting nginx with Docker...')

    // Check if Docker is installed
    try {
      execSync('docker --version', { stdio: 'ignore' })
    } catch (error) {
      console.error('Docker is not installed or not in PATH. Please install Docker.')
      throw new Error('Docker not found')
    }

    // Path to the nginx configuration file
    const configPath = path.resolve(__dirname, 'nginx.conf')

    // Stop any existing nginx container
    try {
      execSync('docker stop koekalenteri-nginx 2>/dev/null || true')
      execSync('docker rm koekalenteri-nginx 2>/dev/null || true')
    } catch (error) {
      // Ignore errors, container might not exist
    }

    // Start nginx with Docker
    const dockerCommand = `docker run --name koekalenteri-nginx -d \
      -p ${NGINX_PORT}:${NGINX_PORT} \
      -v ${configPath}:/etc/nginx/nginx.conf:ro \
      --network koekalenteri \
      nginx:alpine`

    console.log('Running Docker command:', dockerCommand)
    execSync(dockerCommand, { stdio: 'inherit' })

    console.log(`🚀 Nginx started on port ${NGINX_PORT}`)
    console.log('Nginx is routing /api to backend and everything else to frontend')

    return true
  } catch (error) {
    console.error('Failed to start nginx with Docker:', error)
    console.log('\nTroubleshooting tips:')
    console.log('1. Make sure Docker is properly installed and running')
    console.log('2. Check if port 8000 is available and not blocked by firewall')
    console.log('3. Check if the nginx configuration file exists')

    return false
  }
}

/**
 * Start ngrok tunnel and save the URL to a file
 */
async function startNgrok() {
  try {
    // Make sure ngrok is installed and configured
    await ngrok.kill() // Kill any existing ngrok processes

    // Connect to ngrok with more robust configuration
    const url = await ngrok.connect({
      addr: NGINX_PORT,
      proto: 'http',
      region: 'eu', // Use European region for better performance with Paytrail
      onStatusChange: (status) => {
        console.log(`Ngrok status changed: ${status}`)
      },
      authtoken: process.env.NGROK_AUTH_TOKEN, // Use auth token if available
    })

    console.log(`🚀 Ngrok tunnel started: ${url}`)
    console.log('This URL will be used for both frontend and backend')

    // Ensure the directory exists
    const layerDir = path.dirname(BACKEND_URL_FILE)
    if (!fs.existsSync(layerDir)) {
      fs.mkdirSync(layerDir, { recursive: true })
    }

    // Save the URLs to files so they can be read by the Lambda functions
    // For backend, we add /api to the URL
    const backendUrl = `${url}/api`
    fs.writeFileSync(BACKEND_URL_FILE, backendUrl)
    console.log(`Backend tunnel URL saved: ${backendUrl}`)

    // For frontend, we use the URL as is
    fs.writeFileSync(FRONTEND_URL_FILE, url)
    console.log(`Frontend tunnel URL saved: ${url}`)

    // Set environment variables
    process.env.NGROK_URL = url
    process.env.BACKEND_TUNNEL_URL = backendUrl
    process.env.FRONTEND_TUNNEL_URL = url

    return url
  } catch (error) {
    console.error('Failed to start ngrok:', error)
    console.log('\nTroubleshooting tips:')
    console.log('1. Make sure ngrok is properly installed: npm install ngrok --save-dev')
    console.log('2. Check if port 4040 is available and not blocked by firewall')
    console.log('3. Try running ngrok directly: npx ngrok http 8000')
    console.log('4. If you have an ngrok account, set NGROK_AUTH_TOKEN environment variable')

    // Return a fallback URL for development
    const fallbackUrl = `http://localhost:${NGINX_PORT}`
    console.log(`\nUsing fallback URL: ${fallbackUrl}`)
    console.log('Note: External access and Paytrail callbacks will not work with this URL')

    return fallbackUrl
  }
}

/**
 * Get the current ngrok URL
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
 * Stop nginx and ngrok
 */
async function stopServices() {
  try {
    // Stop nginx Docker container
    console.log('Stopping nginx Docker container...')
    try {
      execSync('docker stop koekalenteri-nginx', { stdio: 'ignore' })
      execSync('docker rm koekalenteri-nginx', { stdio: 'ignore' })
      console.log('Nginx Docker container stopped and removed')
    } catch (error) {
      // Ignore errors, container might not exist
      console.log('No nginx Docker container to stop')
    }

    // Stop ngrok
    console.log('Stopping ngrok...')
    await ngrok.kill()
    console.log('Ngrok tunnel stopped')

    // Remove the URL files
    if (fs.existsSync(BACKEND_URL_FILE)) {
      fs.unlinkSync(BACKEND_URL_FILE)
    }
    if (fs.existsSync(FRONTEND_URL_FILE)) {
      fs.unlinkSync(FRONTEND_URL_FILE)
    }
  } catch (error) {
    console.error('Failed to stop services:', error)
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await stopServices()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stopServices()
  process.exit(0)
})

module.exports = {
  startNginx,
  startNgrok,
  getTunnelUrls,
  stopServices,
}

// If this script is run directly, start services
if (require.main === module) {
  Promise.resolve()
    .then(startNginx)
    .then(startNgrok)
    .then((url) => {
      const urls = getTunnelUrls()
      console.log('Services are running:')
      console.log(`Frontend URL: ${urls.frontend || url}`)
      console.log(`Backend URL: ${urls.backend || url + '/api'}`)
      console.log('Press Ctrl+C to stop.')
    })
    .catch((error) => {
      console.error('Failed to start services:', error)
      process.exit(1)
    })
}
