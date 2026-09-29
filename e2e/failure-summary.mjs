/**
 * Writes the failed browser tests into the GitHub job summary, so why a test failed can be read on
 * the run's page without downloading anything: Playwright's error context holds the error, the
 * failing line and the page's accessibility tree at the moment of failure. The trace is still in
 * the e2e-report artifact; trace.playwright.dev opens its trace.zip in the browser, nothing to
 * install.
 *
 *   node e2e/failure-summary.mjs >> "$GITHUB_STEP_SUMMARY"
 */
import fs from 'node:fs'
import path from 'node:path'

const RESULTS = 'test-results/e2e'
/** GitHub caps a step's summary at 1 MiB; one long page tree must not crowd out the others. */
const MAX_CHARS_PER_TEST = 60_000

const contexts = fs.existsSync(RESULTS)
  ? fs
      .readdirSync(RESULTS)
      .map((dir) => path.join(RESULTS, dir, 'error-context.md'))
      .filter((file) => fs.existsSync(file))
  : []

const lines = ['## Failed browser tests', '']
if (!contexts.length) {
  lines.push('No error context was written; the failure happened outside a test (see the job log).')
}
for (const file of contexts) {
  // The file opens with instructions meant for an AI assistant; the report starts at "# Test info".
  const text = fs.readFileSync(file, 'utf8')
  const report = text.slice(Math.max(0, text.indexOf('# Test info')))
  const title = /- Name: (.*)/.exec(report)?.[1] ?? path.basename(path.dirname(file))
  const body = report.length > MAX_CHARS_PER_TEST ? `${report.slice(0, MAX_CHARS_PER_TEST)}\n\n…(cut)` : report
  lines.push(`<details><summary><b>${title}</b></summary>`, '', body.replaceAll(/^#/gm, '###'), '', '</details>', '')
}
lines.push(
  'Traces: download the **e2e-report** artifact and drop a `trace.zip` from it on',
  '[trace.playwright.dev](https://trace.playwright.dev); it runs in the browser and nothing is uploaded.'
)
console.log(lines.join('\n'))
