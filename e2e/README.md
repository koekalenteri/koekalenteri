# End-to-End Testing with Playwright

This directory contains end-to-end tests for the Koekalenteri application using [Playwright](https://playwright.dev/).

## Overview

The e2e tests are designed to test the critical user path of search → registration → payment. The tests use a mocking strategy to simulate API responses, allowing the tests to run without a backend.

## Directory Structure

```
/e2e
  /fixtures       # Test data fixtures
  /page-objects   # Page object models
  /tests          # Test files
  /utils          # Utility functions
```

## Test Files

- `search.spec.ts`: Tests for the search functionality
- `registration.spec.ts`: Tests for the registration process
- `payment.spec.ts`: Tests for the payment process
- `e2e-flow.spec.ts`: End-to-end tests covering the complete user journey

## Running Tests

### Prerequisites

- Node.js 16 or higher
- npm

### Installation

The Playwright dependencies are installed as part of the project setup:

```bash
npm install
```

To install Playwright browsers:

```bash
npx playwright install
```

### Running Tests

To run all tests:

```bash
npm run test-e2e
```

To run tests with UI mode:

```bash
npm run test-e2e:ui
```

To run tests in debug mode:

```bash
npm run test-e2e:debug
```

To run tests in a specific browser:

```bash
npm run test-e2e:chrome
npm run test-e2e:firefox
```

To view the test report:

```bash
npm run test-e2e:report
```

## Mocking Strategy

The tests use a mocking strategy to simulate API responses. The mocks are defined in the `e2e/utils/mocks.ts` file and are set up before each test. This allows the tests to run without a backend and ensures consistent test results.

### Environment Variables

When running locally, the tests will read environment variables from the `.env` file in the project root. This includes the API base URL (`REACT_APP_API_BASE_URL`) which is used for mocking API responses.

The default API base URL is `http://127.0.0.1:8080` if not specified in the `.env` file.

For more details on how environment variables are used in e2e tests, see [ENV_VARIABLES.md](./ENV_VARIABLES.md).

## Page Objects

The tests use the Page Object Model pattern to encapsulate the interaction with the application. Each page has its own class that provides methods for interacting with the page. This makes the tests more maintainable and easier to read.

## CI/CD Integration

The e2e tests are integrated into the CI/CD pipeline and run automatically on pull requests and merges to the main branch. The test results are uploaded as artifacts and can be viewed in the GitHub Actions workflow.

## Adding New Tests

To add a new test:

1. Create a new test file in the `e2e/tests` directory
2. Import the necessary page objects and utilities
3. Write your test using the Playwright test API
4. Run the test to ensure it passes

## Best Practices

- Use page objects to encapsulate page interactions
- Use fixtures for test data
- Use mocks for API responses
- Write small, focused tests
- Use descriptive test names
- Add comments to explain complex test logic
