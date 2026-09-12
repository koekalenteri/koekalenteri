/**
 * `vitest/browser` is an exports-only subpath, and the frontend tsconfig still resolves modules the
 * `node` way, which cannot see it (the visual tests import it too, but they are excluded from the
 * typecheck; setupVisualTests.ts is not). This mirrors vitest's own browser/context.d.ts, which
 * re-exports the installed provider's context, so the names match what runs. Drop it once the
 * tsconfig moves to `bundler` resolution.
 */
declare module 'vitest/browser' {
  export * from '@vitest/browser/context'
}
