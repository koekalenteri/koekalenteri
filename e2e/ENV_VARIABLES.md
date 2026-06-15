# Environment Variables in E2E Tests

This document explains how environment variables are used in the end-to-end (e2e) tests.

## Overview

The e2e tests use environment variables from the `.env` file in the project root when running locally. This includes the API base URL (`REACT_APP_API_BASE_URL`) used by the application under test.

## How It Works

1. The `playwright.config.ts` file loads environment variables from the `.env` file in the project root when running locally:

```typescript
// Load environment variables from .env file when running locally
if (!process.env.CI && fs.existsSync(path.join(__dirname, '.env'))) {
  dotenv.config({ path: path.join(__dirname, '.env') })
}
```

2. The Playwright tests and local services use these environment variables when resolving application and API endpoints:

```typescript
// API base URL from the application
// When running locally, this will be loaded from the .env file in the project root
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ?? 'http://127.0.0.1:8080'
```

## Default Values

If the environment variables are not set in the `.env` file, the following default values are used:

- `REACT_APP_API_BASE_URL`: `http://127.0.0.1:8080`

## Running Tests

To run the e2e tests with environment variables from the `.env` file:

```bash
npm run test-e2e
```

This will automatically load the environment variables from the `.env` file in the project root when running locally.

## Debugging

If you're having issues with environment variables, check the console output when running the tests. The Playwright config and local service scripts log the URLs being used.
