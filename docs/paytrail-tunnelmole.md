# Paytrail Tunnelmole Setup

This document explains how to use tunnelmole for Paytrail callback URLs when developing with the SAM local API.

## Overview

When developing locally, Paytrail needs to send callbacks to your local development server. Since your local server isn't accessible from the internet, we use tunnelmole to create secure tunnels that expose your local ports to the internet.

## Prerequisites

1. Install tunnelmole as a development dependency:
   ```bash
   npm install tunnelmole --save-dev
   ```

2. Tunnelmole doesn't require authentication for basic usage, making it simpler than ngrok.

## How it works

1. The script `start-sam-with-tunnelmole.js`:
   - Starts and seeds DynamoDB
   - Loads e2e test fixtures into DynamoDB (including organizers)
   - Starts the SAM local API (backend on port 8080)
   - Starts the frontend development server (port 3000)
   - Waits for both services to be ready using wait-on
   - Creates two tunnelmole tunnels after services are confirmed running:
     - Backend tunnel to your local SAM API (port 8080)
     - Frontend tunnel to your local frontend server (port 3000)
2. The tunnel URLs are stored and made available to the application as environment variables
3. When creating Paytrail payments, the application uses:
   - Backend tunnel URL for callback URLs
   - Frontend tunnel URL for redirect URLs
4. When you stop the script (Ctrl+C), it automatically cleans up by stopping all services and tunnels

## Files involved

1. **tunnelmole-manager.js**: Manages both frontend and backend tunnelmole tunnels, starting them and providing the URLs to the application
2. **start-sam-with-tunnelmole.js**: Starts both tunnelmole tunnels and the SAM local API with lazy containers
3. Modified Paytrail utility functions to use the backend tunnel URL for callbacks when in development mode

## Usage

Start the SAM local API with tunnelmole:

```bash
npm run start-backend-sam
```

The console will display both tunnel URLs:

```
🚀 Backend tunnel started: https://abc123.tunnelmole.com
🚀 Frontend tunnel started: https://def456.tunnelmole.com
Backend tunnel URL: https://abc123.tunnelmole.com
Frontend tunnel URL: https://def456.tunnelmole.com
```

The backend tunnel URL will be used for Paytrail callbacks.

## Troubleshooting

If you encounter issues with tunnelmole:

1. Make sure tunnelmole is properly installed: `npm install tunnelmole --save-dev`
2. Try running tunnelmole directly: `npx tunnelmole 8080`
3. If tunnelmole fails to start, the script will continue with the SAM local API, but Paytrail callbacks won't work

## Environment Variables

The following environment variables are set when using tunnelmole:

- `BACKEND_TUNNEL_URL`: The public URL for the backend tunnel (used for Paytrail callbacks)
- `FRONTEND_TUNNEL_URL`: The public URL for the frontend tunnel (used for Paytrail redirect URLs)

## Migration from ngrok

If you were previously using ngrok, the new tunnelmole setup provides:

- **Two separate tunnels**: One for frontend and one for backend
- **Simpler setup**: No authentication required
- **Better reliability**: More stable tunnel connections

## Notes

- In production, you should use your actual domain for callbacks and redirects
- Tunnelmole provides free tunnels suitable for development purposes
- The backend tunnel is specifically used for Paytrail payment callbacks
- The frontend tunnel is used for Paytrail redirect URLs and can also be used for testing the frontend application from external devices
- Both tunnels work together to provide a complete Paytrail integration in development mode
