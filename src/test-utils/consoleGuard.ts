/**
 * A green test run that prints errors is not green: the output is where an act() warning, a MUI
 * prop mistake or a rejected fetch first shows, and 300 lines of it in every run is where nobody
 * reads it (KOE-1439). This turns what a test writes to console.error and console.warn into a
 * failure of that test, with the lines it wrote.
 *
 * A test that expects output declares it, one of two ways: `expectConsoleOutput(/pattern/)` for a
 * line it knows is coming (and which then must come, or the test fails for the opposite reason),
 * or its own `vi.spyOn(console, 'error').mockImplementation(...)`, which takes the level over for
 * that test the way the lambda tests already do to read the logger's lines back. A spy installed
 * at file level is left alone for the same reason.
 *
 * The guard is set up once per project from its setup file; it registers the hooks itself.
 */

type Level = 'debug' | 'error' | 'info' | 'log' | 'warn'

interface Options {
  /** Levels that fail the test when written to. */
  readonly fail?: readonly Level[]
  /** Levels silenced entirely: the lambdas' info lines say nothing in a test. */
  readonly mute?: readonly Level[]
}

interface Captured {
  level: Level
  text: string
}

const captured: Captured[] = []
let expected: RegExp[] = []
let installed: Array<{ level: Level; original: (...args: unknown[]) => void }> = []

/** console's %s-style substitution, enough for React's and MUI's messages to read as printed. */
const formatArgs = (args: unknown[]): string => {
  const [first, ...rest] = args
  const asText = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
    try {
      return JSON.stringify(value) ?? String(value)
    } catch {
      return String(value)
    }
  }
  if (typeof first !== 'string') return args.map(asText).join(' ')

  const remaining = [...rest]
  const text = first.replaceAll(/%[sdifoOj]|%%/g, (token) => {
    if (token === '%%') return '%'
    return remaining.length ? asText(remaining.shift()) : token
  })
  return [text, ...remaining.map(asText)].join(' ')
}

const toRegExp = (pattern: string | RegExp): RegExp =>
  pattern instanceof RegExp ? pattern : new RegExp(pattern.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`))

/**
 * Output this test expects on console.error or console.warn. Each pattern must match at least one
 * line the test writes, and every line must match some pattern; anything else fails the test.
 */
export const expectConsoleOutput = (...patterns: Array<string | RegExp>) => {
  expected.push(...patterns.map(toRegExp))
}

const describeLines = (lines: Captured[]) => lines.map((line) => `  [${line.level}] ${line.text}`).join('\n')

export const guardConsole = ({ fail = ['error', 'warn'], mute = [] }: Options = {}) => {
  beforeEach(() => {
    captured.length = 0
    expected = []
    installed = []
    for (const level of [...fail, ...mute]) {
      // A spy the test file installed itself (at file level, before this hook) owns the level.
      if (vi.isMockFunction(console[level])) continue
      // A plain function, not a spy: a file's `vi.resetAllMocks()` or `vi.restoreAllMocks()` in its
      // own beforeEach would put the original back under a spy, and the lines would flow again.
      const original = console[level]
      console[level] = (...args: unknown[]) => {
        if (fail.includes(level)) captured.push({ level, text: formatArgs(args) })
      }
      installed.push({ level, original })
    }
  })

  afterEach(() => {
    const lines = captured.splice(0)
    const patterns = expected
    expected = []
    // The original goes back whatever the test left on top, a spy of its own included.
    for (const { level, original } of installed.splice(0)) console[level] = original

    const unexpected = lines.filter((line) => !patterns.some((pattern) => pattern.test(line.text)))
    const unmet = patterns.filter((pattern) => !lines.some((line) => pattern.test(line.text)))
    const problems: string[] = []
    if (unexpected.length) {
      problems.push(
        `The test wrote to the console without declaring it (expectConsoleOutput, or spy on the level):\n${describeLines(unexpected)}`
      )
    }
    if (unmet.length) {
      const declared = unmet.map((pattern) => `  ${pattern}`).join('\n')
      problems.push(`The test declared console output that never came:\n${declared}`)
    }
    if (problems.length) throw new Error(problems.join('\n\n'))
  })
}
