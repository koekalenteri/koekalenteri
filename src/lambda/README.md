# Lambda backend architecture

This folder follows a module-centric backend structure.

## Core rules

1. Lambda function folders (for example `PutEventFunction`, `PaymentCreateFunction`) are transport adapters only.
2. Domain modules own behavior and data access.
3. `lib/` is for generic runtime and shared technical helpers, not domain ownership.

## Expected module shape

Each domain module should prefer this shape when applicable:

- `api.ts` for handler-facing entry points and read-model composition
- `actions.ts` for write orchestration/use-case flows
- `repository.ts` for persistence access
- `rules.ts` for pure domain logic/calculations
- `policy.ts` for pure authorization/business permission predicates

Current domains include `event`, `registration`, `payment`, `refund`, `stats`, `ws`, and `auth`.

## Auth module direction

Auth is a first-class module under `auth/`.

- `auth/policy.ts` contains pure permission predicates.
- Additional auth responsibilities are migrated into `auth/` directly.
- Do not add compatibility re-export layers.

## Migration conventions

- Move behavior out of handlers into module `api`/`actions` in small steps.
- Keep handlers focused on parse/authenticate/call module/map response.
- When moving persistence, prefer module repositories over direct `CustomDynamoClient` usage in handlers.
- Delete old code paths after migration to avoid dual ownership.
