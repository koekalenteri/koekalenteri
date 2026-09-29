/**
 * Writes the e2e run into the GitHub job summary: every test with its result and issues, then, for
 * the tests that failed, Playwright's error context (the error, the failing line and the page's
 * accessibility tree when it failed), so a run can be read on its page without downloading
 * anything. The trace is still in the e2e-report artifact; trace.playwright.dev opens its trace.zip
 * in the browser, nothing to install. What the tests are is in e2e/TESTS.md (catalog.mjs).
 *
 *   node e2e/summary.mjs >> "$GITHUB_STEP_SUMMARY"
 */
import fs from 'node:fs'
import path from 'node:path'

/** Where the CI reporter in playwright.config.ts writes the results. */
const RESULTS_JSON = 'test-results/e2e-results.json'
const JIRA = 'https://koekalenteri.atlassian.net/browse'
/** GitHub caps a step's summary at 1 MiB; one long page tree must not crowd out the others. */
const MAX_CHARS_PER_TEST = 60_000

const lines = ['## Browser tests', '']

const collect = (suite, path = []) => [
  ...(suite.specs ?? []).map((spec) => ({ ...spec, path })),
  ...(suite.suites ?? []).flatMap((child) => collect(child, [...path, child.title])),
]

/** A test's outcome in words: a known bug that fails is fine, one that passes needs its mark removed. */
const outcome = (test) => {
  const knownBug = test.expectedStatus === 'failed'
  if (test.status === 'expected') return knownBug ? '🐞 fails as expected (known bug)' : '✅ passed'
  if (test.status === 'flaky') return '⚠️ passed on retry'
  if (test.status === 'skipped') return '⏭️ skipped'
  return knownBug ? '❗ passed: the bug looks fixed, remove `test.fail`' : '❌ failed'
}

const issues = (test) =>
  test.annotations
    .filter((annotation) => annotation.type === 'issue')
    .map((annotation) => {
      const [key] = annotation.description.split(' ')
      return `[${key}](${JIRA}/${key})`
    })
    .join(' ')

/** The error contexts of the tests that did not end as expected; a known bug's failure is no news. */
const contexts = []

if (fs.existsSync(RESULTS_JSON)) {
  const { stats, suites } = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'))
  const seconds = Math.round(stats.duration / 1000)
  lines.push(
    `${stats.expected} as expected, ${stats.unexpected} unexpected, ${stats.flaky} flaky, ${stats.skipped} skipped, in ${seconds} s.`,
    '',
    '| Result | Test | Issues |',
    '| --- | --- | --- |'
  )
  for (const file of suites) {
    for (const spec of collect(file)) {
      const test = spec.tests[0]
      const title = [file.file, ...spec.path, spec.title].join(' › ').replaceAll('|', '\\|')
      lines.push(`| ${outcome(test)} | ${title} | ${issues(test)} |`)
      if (test.status === 'expected') continue
      for (const result of test.results) {
        for (const attachment of result.attachments ?? []) {
          if (attachment.name === 'error-context' && attachment.path && fs.existsSync(attachment.path)) {
            contexts.push(attachment.path)
          }
        }
      }
    }
  }
  lines.push('')
} else {
  lines.push('No results: the tests did not run. The job log shows the step that stopped it.', '')
}

if (contexts.length) lines.push('### Why they failed', '')
for (const file of contexts) {
  // The file opens with instructions meant for an AI assistant; the report starts at "# Test info".
  const text = fs.readFileSync(file, 'utf8')
  const report = text.slice(Math.max(0, text.indexOf('# Test info')))
  const title = /- Name: (.*)/.exec(report)?.[1] ?? path.basename(path.dirname(file))
  const body = report.length > MAX_CHARS_PER_TEST ? `${report.slice(0, MAX_CHARS_PER_TEST)}\n\n…(cut)` : report
  lines.push(`<details><summary><b>${title}</b></summary>`, '', body.replaceAll(/^#/gm, '####'), '', '</details>', '')
}
if (contexts.length) {
  lines.push(
    'Traces: download the **e2e-report** artifact and drop a `trace.zip` from it on',
    '[trace.playwright.dev](https://trace.playwright.dev); it runs in the browser and nothing is uploaded.'
  )
}
console.log(lines.join('\n'))
