// Stats module stable public API.
//
// Non-stats modules (registration, event, payment) must import from this
// file only — never from stats/actions.ts or stats/repository.ts directly.
// This keeps the stats implementation replaceable without touching callers.
//
// Re-exports the main write orchestration entrypoint.
// Read-side queries live in src/lambda/stats/queries.ts.

export { recordRegistrationChange } from './actions'
