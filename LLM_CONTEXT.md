# Koekalenteri LLM Context (Condensed)

## Project Overview
- Open-source system for retriever hunt test calendars and registrations in Finland
- **Backend**: AWS SAM, TypeScript Lambda, DynamoDB, API Gateway
- **Frontend**: React, TypeScript, Recoil, React Router
- **Tools**: i18next (localization), Jest (testing)

## Key Folders
- `src/lambda/`: AWS Lambda handlers
- `src/pages/`: React components
- `src/lib/`: Utilities
- `src/types/`: TypeScript definitions
- `src/i18n/`: Localization files

## Core Patterns
- Serverless microservices with granular Lambdas
- Recoil atoms/selectors for frontend state
- Lambda handlers wrapped with shared `lambda` utility for error handling
- Use `response` utility for all API responses
- Throw `LambdaError` for domain-specific errors

## DynamoDB Guidelines
- Access environment variables via `src/lambda/config.ts` (`CONFIG`)
- Create only one DynamoDB client (`dynamoDB`) per Lambda handler
- Always provide table name as parameter when accessing other tables

## Development Guidelines
- Follow existing patterns for consistency
- Validate types and run tests after changes
- Backend tests: `npm run test-backend`
- Fully test every new or changed function in `src/lambda/lib/`, including its
  normal path, edge cases, and error or invalid-input behavior where applicable.
- UI changes should follow existing styling conventions
- In Jest mock assertions, prefer call matchers such as `toHaveBeenCalledWith`,
  `toHaveBeenNthCalledWith`, and `toHaveBeenCalledTimes` over reading
  `mock.calls` directly.
- Do not use type assertions (especially `as any` or `as unknown as`) to silence
  errors in production or test code. Model values and mocks with their real
  signatures, narrow unknown values safely, or express behavior directly with
  Jest matchers. Any unavoidable boundary conversion needs a specific comment
  explaining why it is safe.
