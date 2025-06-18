/**
 * Cloudflared + Nginx Manager
 *
 * This script manages a single cloudflared tunnel and nginx for both frontend and backend.
 * It routes /api to backend and everything else to frontend through nginx.
 */

const fs = require('fs')
const path = require('path')
const { spawn, execSync, exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

// Default port for nginx (using 8888 to avoid collision with DynamoDB on 8000)
const NGINX_PORT = parseInt(process.env.NGINX_PORT, 10) || 8888

// Files to store the tunnel URLs (in layer/nodejs so Lambda can access them)
const BACKEND_URL_FILE = path.join(__dirname, '../dist/layer/nodejs/.backend-tunnel-url')
const FRONTEND_URL_FILE = path.join(__dirname, '../dist/layer/nodejs/.frontend-tunnel-url')

// Store nginx process
let nginxProcess = null
// Store cloudflared process
let cloudflaredProcess = null

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
    console.log('2. Check if port 8888 is available and not blocked by firewall')
    console.log('3. Check if the nginx configuration file exists')

    return false
  }
}

/**
 * Start cloudflared tunnel and save the URL to a file
 */
async function startCloudflared() {
  // Kill any existing cloudflared processes (optional)
  try {
    execSync('pkill -f cloudflared', { stdio: 'ignore' })
  } catch {
    //ignored
  }

  console.log('🚀 Starting cloudflared tunnel...')

  const proc = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://localhost:${NGINX_PORT}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return await new Promise((resolve, reject) => {
    const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/

    const saveUrls = (url) => {
      const backendUrl = `${url}/api`
      const dir = path.dirname(BACKEND_URL_FILE)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

      fs.writeFileSync(BACKEND_URL_FILE, backendUrl)
      fs.writeFileSync(FRONTEND_URL_FILE, url)
      console.log(`✅ Tunnel ready:\n  Frontend: ${url}\n  Backend: ${backendUrl}`)
    }

    const handleOutput = (data) => {
      const text = data.toString()
      const match = text.match(urlRegex)
      if (match) {
        saveUrls(match[0])
        resolve()
      }
    }

    proc.stdout.on('data', handleOutput)
    proc.stderr.on('data', handleOutput)

    proc.on('error', (err) => {
      reject(new Error(`❌ Failed to start cloudflared: ${err.message}`))
    })

    setTimeout(() => {
      reject(new Error('❌ Timeout: cloudflared did not return a tunnel URL in time.'))
    }, 15000)
  })
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
 * Stop nginx and cloudflared
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

    // Stop cloudflared
    console.log('Stopping cloudflared...')
    if (cloudflaredProcess) {
      cloudflaredProcess.kill()
      cloudflaredProcess = null
    } else {
      try {
        execSync('pkill -f cloudflared', { stdio: 'ignore' })
      } catch (error) {
        // Ignore errors, process might not exist
      }
    }
    console.log('Cloudflared tunnel stopped')

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
  startCloudflared,
  getTunnelUrls,
  stopServices,
}

// If this script is run directly, start services
if (require.main === module) {
  Promise.resolve()
    .then(startNginx)
    .then(startCloudflared)
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
