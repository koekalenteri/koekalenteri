# Using Ngrok for Paytrail Callbacks in SAM Local Environment

This document explains how to use ngrok for Paytrail callback URLs when developing with the SAM local API.

## Overview

When developing with Paytrail integration, you need to provide callback URLs that Paytrail can reach to notify your application about payment events. In a local development environment, your SAM local API runs on localhost, which is not accessible from the internet.

Ngrok solves this problem by creating a secure tunnel to your local SAM API, providing a public URL that Paytrail can use to reach your application.

## Prerequisites

**Important: Ngrok requires an auth token to function properly.**

1. Sign up for a free account at [ngrok.cotm](https://ngrok.com)
2. Get your auth token from the ngrok dashboard
3. Set it as an environment variable before running the script:

```bash
export NGROK_AUTH_TOKEN=your_auth_token
```

Or add it to your `.env` file:

```
NGROK_AUTH_TOKEN=your_auth_token
```

## How It Works

1. When you start the SAM local API using `npm run start-backend-sam`, the script:
   - Starts and seeds DynamoDB
   - Loads e2e test fixtures into DynamoDB (including organizers)
   - Creates an ngrok tunnel to your local SAM API (port 8080)
   - Starts the SAM local API with eager containers
2. The ngrok URL is stored and made available to the application as an environment variable
3. When creating Paytrail payments, the application uses the ngrok URL for callback URLs instead of the regular host
4. When you stop the script (Ctrl+C), it automatically cleans up by stopping DynamoDB

## Implementation Details

The implementation consists of:

1. **ngrok-manager.js**: Manages the ngrok tunnel, starting it and providing the URL to the application
2. **start-sam-with-ngrok.js**: Starts both ngrok and the SAM local API with eager containers
3. Modified Paytrail utility functions to use the ngrok URL for callbacks when in development mode

## Usage

Start the SAM local API with ngrok:

```bash
npm run start-backend-sam
```

The console will display the ngrok URL that is being used for Paytrail callbacks:

```
🚀 Ngrok tunnel started: https://abc123.eu.ngrok.io
This URL will be used for Paytrail callbacks
```

## Troubleshooting

If you encounter issues with ngrok:

1. **Make sure you have set your NGROK_AUTH_TOKEN** as described in the Prerequisites section
2. If you see a "ECONNREFUSED 127.0.0.1:4040" error:
   - Make sure port 4040 is not blocked by a firewall
   - Try running ngrok directly: `npx ngrok http 8080`
3. If ngrok fails to start, the script will continue with the SAM local API, but Paytrail callbacks won't work

## Notes

- In production, you should use your actual domain for callbacks
- The free tier of ngrok has some limitations, but it's sufficient for development purposes
