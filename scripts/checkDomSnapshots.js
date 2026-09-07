// Rejects a new toMatchSnapshot()/toMatchInlineSnapshot() call whose target is a raw DOM dump --
// container, container.firstChild, baseElement, or asFragment(). KOE-1315 spent thirteen tickets
// converting 67 such calls into role/text assertions or real screenshots (AGENTS.md's "Visual Test
// Convention"); nothing stopped the next one from creeping back in until this check existed. A data
// snapshot -- a plain object, array, or rendered string, not a rendered container -- is unaffected.
const { execFileSync } = require('node:child_process')

// Known-good data snapshots that predate this check, listed explicitly (KOE-1315's own accounting,
// verified by hand) so a rename or reformat of these files can't accidentally start failing them.
const ALLOWED_FILES = new Set([
  'src/routes.test.tsx',
  'src/lambda/GetOfficialsFunction/getOfficialsLambda.test.ts',
  'src/lambda/GetJudgesFunction/getJudgesLambda.test.ts',
  'src/lambda/GetEventTypesFunction/getEventTypesLambda.test.ts',
  'src/lambda/lib/official.test.ts',
  'src/lambda/lib/judge.test.ts',
  'src/lambda/utils/email/markdown.test.ts',
  'src/lambda/utils/email/mdast2hast/link.test.ts',
  'src/lib/priority.test.ts',
  'src/pages/admin/eventListPage/columns.test.ts',
  'src/pages/components/registrationForm/validation.test.ts',
])

const DOM_SNAPSHOT_TARGET =
  /expect\(\s*(container(?:\.firstChild)?|baseElement|asFragment\(\))\s*\)\s*\.\s*toMatch(?:Inline)?Snapshot\s*\(/

function stagedTestFiles() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  })
  return output
    .split('\n')
    .filter(Boolean)
    .filter((file) => /\.(test|spec)\.tsx?$/.test(file))
    .filter((file) => !ALLOWED_FILES.has(file))
}

function stagedContent(file) {
  return execFileSync('git', ['show', `:${file}`], { encoding: 'utf8' })
}

const offenders = []

for (const file of stagedTestFiles()) {
  const lines = stagedContent(file).split('\n')
  lines.forEach((line, index) => {
    if (DOM_SNAPSHOT_TARGET.test(line)) {
      offenders.push({ file, line: index + 1, text: line.trim() })
    }
  })
}

if (offenders.length > 0) {
  console.error('A DOM snapshot is not an acceptable test (see AGENTS.md "Visual Test Convention"):')
  for (const { file, line, text } of offenders) {
    console.error(`  ${file}:${line}\n    ${text}`)
  }
  console.error('\nUse a real screenshot (*.visual.test.tsx) for the visual concern, and a role/text/value')
  console.error('assertion for the behavioral one. A data snapshot (a plain object, array, or string --')
  console.error('not a rendered container) is still fine.')
  process.exit(1)
}
