# Koekalenteri LLM Session Context

This document provides focused contextualization, pattern exposure, and prompt engineering strategies for ChatGPT sessions on the Koekalenteri project.

## 1. Project Overview
Koekalenteri is an open-source system to manage retriever hunt test calendars and registrations in Finland.
It consists of:
- Backend: AWS SAM with TypeScript Lambda functions, DynamoDB, API Gateway.
- Frontend: React (TypeScript), Recoil state management, React Router.
- Internationalization: i18next with JSON locale files.
- Testing: Jest for unit and integration tests.

## 2. Folder Structure Highlights
- `src/` primary application code
  - `src/lambda/` AWS Lambda handlers
  - `src/pages/` React pages and components
  - `src/api/` shared client-side API wrappers
  - `src/lib/` utility modules
  - `src/hooks/` custom React hooks
  - `src/i18n/` localization configuration and files
  - `src/types/` TypeScript type definitions
- `template.yaml` AWS SAM template
- `.env_sample` environment variables template
- `Makefile`, `scripts/`, and CI configs

## 3. Core Design Patterns
- Serverless microservices: granular Lambdas per resource.
- Recoil atoms/selectors: centralize frontend state.
- DTO and API wrapper patterns: consistent client-server contracts.
- i18next: resource key patterns and dynamic locale loading.
- Jest mocks: isolation of external dependencies.
### 3.1 Lambda Handler Exception Handling & Response Pattern

- All Lambda handlers are wrapped with a shared `lambda` utility, which centralizes exception handling and metrics. Unhandled exceptions are caught by the wrapper, ensuring consistent error responses and observability.
- Handlers should use the `response` utility function to format all API responses, including successful results. This ensures both success and error responses follow a consistent structure.
- Internal try/catch blocks for generic error handling are discouraged in handlers; errors should propagate to the wrapper. For domain-specific errors, throw a `LambdaError` to return a custom status and message.

## 4. Common Tasks & Prompt Templates

### 4.1 Adding a new Lambda function
**Prompt Pattern:**
```
"Generate a new AWS SAM Lambda function handler in TypeScript for resource X. Include API Gateway integration in `template.yaml`, reference implementation in `src/lambda/GetRegistrationFunction/handler.ts`, and add unit tests with Jest in `src/lambda/XFunction/XFunction.test.ts`."
```

### 4.2 Extending Recoil State
**Prompt Pattern:**
```
"Create a new Recoil atom and selector for feature Y. Place atom in `src/pages/admin/recoil/stats/atoms.ts` and update React component in `src/pages/admin/ComponentPage.tsx` to subscribe to this state. Write corresponding tests in `src/pages/admin/__tests__/ComponentPage.test.tsx`."
```

### 4.3 Localization Update
**Prompt Pattern:**
```
"Add new translation key `featureZ.title` to English and Finnish locale JSON (`src/i18n/locales/en/translation.json`, `src/i18n/locales/fi/translation.json`) and update UI text in `src/pages/FeatureZPage.tsx`."
```

- All Lambda environment variables (including DynamoDB table names) must be accessed via `src/lambda/config.ts` (`CONFIG`), not directly from `process.env`.
- Only a single DynamoDB client (`dynamoDB`) should be constructed in the global scope per Lambda handler. Do not create multiple clients for different tables.
- When using the client to access a table other than the one it was initialized with, always provide the table name as a parameter to the method (e.g., `dynamoDB.readAll(CONFIG.registrationTable)`).
- The DynamoDB client variable must be named `dynamoDB` for consistency across the codebase.
## 5. Strategic Engineering Guidelines
- Always reference existing patterns (handlers, atoms, tests) for consistency.
- Validate TypeScript types and run existing tests after modifications.
- For UI changes, follow existing styling conventions (CSS modules, theme constants).
- Use `npm run lint`, `npm run test`, and `npm run start` to iterate rapidly.

## 6. How to Use
At the start of each LLM session, load this context file and instruct:
```
"You are an expert software engineer. The following is the Koekalenteri project context: [contents of this file]. Respond with precise code changes and commands."
