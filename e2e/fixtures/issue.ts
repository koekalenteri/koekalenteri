/**
 * A Jira issue a test belongs to or works around, as a static annotation: `playwright test --list`
 * sees it without running anything, which is what e2e/TESTS.md is generated from (catalog.mjs).
 */
export const issue = (key: `KOE-${number}`, note?: string) => ({
  description: note ? `${key} ${note}` : key,
  type: 'issue',
})
