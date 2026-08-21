declare module 'jest-axe' {
  export const axe: (html: Element | string) => Promise<unknown>
  export const toHaveNoViolations: import('vitest').RawMatcherFn
}
