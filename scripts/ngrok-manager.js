/**
 * Ngrok Manager for Paytrail Callbacks
 *
 * This script manages the ngrok tunnel for Paytrail callbacks in development.
 * It starts an ngrok tunnel and provides the public URL to the application.
 */

const ngrok = require('ngrok')
const fs = require('fs')
const path = require('path')

// Default port for the SAM local API
const DEFAULT_PORT = parseInt(process.env.SAM_PORT, 10) || 8080

// File to store the ngrok URL
const NGROK_URL_FILE = path.join(__dirname, '../.ngrok-url')

/**
 * Start ngrok tunnel and save the URL to a file
 */
async function startNgrok() {
  try {
    // Make sure ngrok is installed and configured
    await ngrok.kill() // Kill any existing ngrok processes

    // Connect to ngrok with more robust configuration
    const url = await ngrok.connect({
      addr: DEFAULT_PORT,
      proto: 'http',
      region: 'eu', // Use European region for better performance with Paytrail
      onStatusChange: (status) => {
        console.log(`Ngrok status changed: ${status}`)
      },
      authtoken: process.env.NGROK_AUTH_TOKEN, // Use auth token if available
    })

    console.log(`🚀 Ngrok tunnel started: ${url}`)
    console.log('This URL will be used for Paytrail callbacks')

    // Save the URL to a file so it can be read by the application
    fs.writeFileSync(NGROK_URL_FILE, url)

    return url
  } catch (error) {
    console.error('Failed to start ngrok:', error)
    console.log('\nTroubleshooting tips:')
    console.log('1. Make sure ngrok is properly installed: npm install ngrok --save-dev')
    console.log('2. Check if port 4040 is available and not blocked by firewall')
    console.log('3. Try running ngrok directly: npx ngrok http 8080')
    console.log('4. If you have an ngrok account, set NGROK_AUTH_TOKEN environment variable')

    // Return a fallback URL for development
    const fallbackUrl = `http://localhost:${DEFAULT_PORT}`
    console.log(`\nUsing fallback URL: ${fallbackUrl}`)
    console.log('Note: Paytrail callbacks will not work with this URL')

    return fallbackUrl
  }
}

/**
 * Get the current ngrok URL
 */
function getNgrokUrl() {
  try {
    if (fs.existsSync(NGROK_URL_FILE)) {
      return fs.readFileSync(NGROK_URL_FILE, 'utf8').trim()
    }
  } catch (error) {
    console.error('Failed to read ngrok URL:', error)
  }
  return null
}

/**
 * Stop the ngrok tunnel
 */
async function stopNgrok() {
  try {
    await ngrok.kill()
    console.log('Ngrok tunnel stopped')

    // Remove the URL file
    if (fs.existsSync(NGROK_URL_FILE)) {
      fs.unlinkSync(NGROK_URL_FILE)
    }
  } catch (error) {
    console.error('Failed to stop ngrok:', error)
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  await stopNgrok()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await stopNgrok()
  process.exit(0)
})

module.exports = {
  startNgrok,
  getNgrokUrl,
  stopNgrok,
}

// If this script is run directly, start ngrok
if (require.main === module) {
  startNgrok()
    .then(() => {
      console.log('Ngrok is running. Press Ctrl+C to stop.')
    })
    .catch((error) => {
      console.error('Failed to start ngrok:', error)
      process.exit(1)
    })
}
