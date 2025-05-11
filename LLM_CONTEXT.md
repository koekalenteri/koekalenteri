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
- UI changes should follow existing styling conventions
