import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

/**
 * Adding a lambda used to mean keeping three places in step by hand, and a function present in one
 * and missing from the other surfaced at deploy time or, worse, as a route that answered 404 in
 * production. This compares the two that can disagree: the directories under src/lambda and the
 * CodeUri values in the built template.
 */
const buildTemplate = () => {
  execFileSync(process.execPath, ['scripts/build-template.mjs'], { stdio: 'ignore' })

  return readFileSync('dist/template.yaml', 'utf8')
}

const template = buildTemplate()

const handlerDirectories = readdirSync('src/lambda', { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(`src/lambda/${entry.name}/handler.ts`))
  .map((entry) => entry.name)
  .sort()

const matchAll = (pattern: RegExp) => [...template.matchAll(pattern)].map((match) => match[1])

describe('template', () => {
  it('has a function for every lambda directory, and nothing else', () => {
    const codeUris = matchAll(/^ {6}CodeUri: lambda\/(\w+)$/gm).sort()

    expect(handlerDirectories.length).toBeGreaterThan(0)
    expect(codeUris).toEqual(handlerDirectories)
  })

  // The build writes these for every function that does not declare its own, so a new lambda gets a
  // retention without anyone remembering to ask for one.
  it('has a log group for every function', () => {
    const functions = matchAll(/^ {2}(\w+):\n {4}Type: AWS::Serverless::Function\s*$/gm).sort()
    const logGroups = matchAll(/^ {2}(\w+)LogGroup:\n {4}Type: AWS::Logs::LogGroup\s*$/gm).sort()

    expect(functions.length).toBe(handlerDirectories.length)
    // A subset: the API Gateway access log group is in here too, and it belongs to no function.
    expect(functions.filter((name) => !logGroups.includes(name))).toEqual([])
  })
})
