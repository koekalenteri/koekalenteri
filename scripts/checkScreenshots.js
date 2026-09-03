// Fails the commit if a component's darwin screenshot baseline changed without its linux
// counterpart (or vice versa) also changing, *while the component's own source or test file is
// also part of the commit*. The two baselines are generated separately -- darwin by
// `npm run test-visual -- -u` on a dev machine, linux by `npm run test-visual-linux -- -u`
// via Docker -- so it is easy to update one and forget the other, which then only surfaces as
// a CI failure days later. Comparing staged files instead catches it before the commit lands.
//
// The source-file condition is what lets a commit fix just one platform's already-drifted
// baseline (as happened once already -- see git log) without being forced to touch the other,
// unchanged platform too: pairing is only enforced when this commit is the one that changed
// what the component renders.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const DARWIN_SUFFIX = '-chromium-darwin.png'
const LINUX_SUFFIX = '-chromium-linux.png'
const SCREENSHOTS_SEGMENT = '__screenshots__'
const VISUAL_TEST_SUFFIX = '.visual.test.tsx'

function stagedFiles() {
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {
    encoding: 'utf8',
  })
  return new Set(output.split('\n').filter(Boolean))
}

function siblingOf(file) {
  if (file.endsWith(DARWIN_SUFFIX)) {
    return { other: file.slice(0, -DARWIN_SUFFIX.length) + LINUX_SUFFIX, otherPlatform: 'linux' }
  }
  if (file.endsWith(LINUX_SUFFIX)) {
    return { other: file.slice(0, -LINUX_SUFFIX.length) + DARWIN_SUFFIX, otherPlatform: 'darwin' }
  }
  return undefined
}

/** `.../stats/__screenshots__/BreedDistributionChart.visual.test.tsx/name-chromium-darwin.png` -> `BreedDistributionChart`. */
function componentNameOf(file) {
  const segments = file.split('/')
  const index = segments.indexOf(SCREENSHOTS_SEGMENT)
  const testFileSegment = index === -1 ? undefined : segments[index + 1]
  return testFileSegment?.endsWith(VISUAL_TEST_SUFFIX)
    ? testFileSegment.slice(0, -VISUAL_TEST_SUFFIX.length)
    : undefined
}

function componentSourceStaged(staged, componentName) {
  if (!componentName) return true // Unrecognized layout: err on the side of enforcing the pairing.
  return [...staged].some((file) => {
    if (file.includes(SCREENSHOTS_SEGMENT)) return false
    return path.basename(file).startsWith(`${componentName}.`)
  })
}

const staged = stagedFiles()
const missing = []

for (const file of staged) {
  if (!file.includes(SCREENSHOTS_SEGMENT)) continue
  const sibling = siblingOf(file)
  if (!sibling || staged.has(sibling.other)) continue
  if (componentSourceStaged(staged, componentNameOf(file))) missing.push({ file, ...sibling })
}

if (missing.length > 0) {
  console.error('Screenshot baseline changed on only one platform:')
  for (const { file, other, otherPlatform } of missing) {
    console.error(`  ${file}\n    -- but its ${otherPlatform} counterpart was not staged: ${other}`)
  }
  console.error('\nRegenerate the missing platform and stage it, e.g.:')
  console.error('  npm run test-visual -- --run <TestName> -u          # darwin, on this machine')
  console.error('  npm run test-visual-linux -- --run <TestName> -u    # linux, via Docker')
  process.exit(1)
}
