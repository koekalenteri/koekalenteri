# Paytrail Ngrok + Nginx Setup

This document explains how to use ngrok with nginx for Paytrail callback URLs when developing with the SAM local API.

## Overview

When developing locally, Paytrail needs to send callbacks to your local development server. Since your local server isn't accessible from the internet, we use ngrok to create a secure tunnel that exposes your local ports to the internet.

The free tier of ngrok only allows one tunnel at a time, so we use nginx in a Docker container to route traffic between the frontend and backend services through a single tunnel:

- `/api/*` routes are directed to the backend (port 8080)
- All other routes are directed to the frontend (port 3000)

Nginx runs on port 8888 to avoid conflicts with DynamoDB (which uses port 8000).

## Prerequisites

1. Docker must be installed and running on your system:
   - [Install Docker](https://docs.docker.com/get-docker/)

2. Install ngrok as a development dependency:
   ```bash
   npm install ngrok --save-dev
   ```

3. (Optional) Create a free ngrok account and set your auth token:
   ```bash
   export NGROK_AUTH_TOKEN=your_auth_token
   ```

## How it works

1. The script `start-sam-with-ngrok-nginx.js`:
   - Starts and seeds DynamoDB
   - Loads e2e test fixtures into DynamoDB (including organizers)
   - Starts the SAM local API (backend on port 8080)
   - Starts the frontend development server (port 3000)
   - Waits for both services to be ready using wait-on
   - Starts nginx in a Docker container with a configuration that routes traffic between frontend and backend
   - Creates a single ngrok tunnel to the nginx port (8888)
   - The Docker container is connected to the koekalenteri network to access the Lambda functions

2. The tunnel URLs are stored in files and made available to the application:
   - Backend tunnel URL: `https://xyz.ngrok.io/api`
   - Frontend tunnel URL: `https://xyz.ngrok.io`

3. When creating Paytrail payments, the application uses:
   - Backend tunnel URL for callback URLs
   - Frontend tunnel URL for redirect URLs

4. When you stop the script (Ctrl+C), it automatically cleans up by stopping all services and tunnels

## Files involved

1. **nginx.conf**: Configures nginx to route traffic between frontend and backend
2. **ngrok-nginx-manager.js**: Manages the ngrok tunnel and nginx, providing the URLs to the application
3. **start-sam-with-ngrok-nginx.js**: Starts both services and the ngrok tunnel with nginx routing
4. Modified Paytrail utility functions to use the tunnel URLs for callbacks when in development mode

## Usage

Start the SAM local API with ngrok + nginx:

```bash
npm run start-backend-sam
```

The console will display the tunnel URLs:

```
🚀 Ngrok tunnel started: https://abc123.ngrok.io
Backend tunnel URL: https://abc123.ngrok.io/api
Frontend tunnel URL: https://abc123.ngrok.io
```

The backend tunnel URL will be used for Paytrail callbacks, and the frontend tunnel URL will be used for redirects.

## Troubleshooting

If you encounter issues with the setup:

1. Make sure Docker is properly installed and running: `docker --version`
2. Make sure the koekalenteri Docker network exists: `docker network ls | grep koekalenteri`
3. Make sure ngrok is properly installed: `npm install ngrok --save-dev`
4. Check if ports 8888, 8080, and 3000 are available and not blocked by firewall
4. Try running ngrok directly: `npx ngrok http 8000`
5. Check Docker logs: `docker logs koekalenteri-nginx`
6. If ngrok fails to start, the script will continue with the SAM local API, but Paytrail callbacks won't work

## Migration from tunnelmole

This setup replaces the previous tunnelmole setup with the following advantages:

- **Single tunnel**: Works with ngrok free tier which only allows one tunnel
- **Efficient routing**: Uses nginx to route traffic between frontend and backend
- **Better stability**: ngrok provides more stable tunnels than tunnelmole
- **Authentication support**: Can use ngrok authentication for better security and reliability

## Notes

- In production, you should use your actual domain for callbacks and redirects
- The backend tunnel URL is specifically used for Paytrail payment callbacks
- The frontend tunnel URL is used for Paytrail redirect URLs and can also be used for testing the frontend application from external devices
