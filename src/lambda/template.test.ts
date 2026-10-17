import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isGranted, unusedGrants } from './test-utils/dynamoActions'
import { analyzeTableUse } from './test-utils/lambdaTableUse'
import { templateTables } from './test-utils/templateGrants'

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

    expect(functions).toHaveLength(handlerDirectories.length)
    // A subset: the API Gateway access log group is in here too, and it belongs to no function.
    expect(functions.filter((name) => !logGroups.includes(name))).toEqual([])
  })

  // An event is copied into test or dev, never into prod (KOE-1471): nothing may name a prod
  // resource, and prod has no function that could receive a copy.
  it('reaches no prod resource from an event copy', () => {
    const functions = template.split(/^ {2}(?=\w+:\n {4}Type: )/m)
    const exporter = functions.find((block) => block.startsWith('ExportEventToStageFunction:')) ?? ''
    const importer = functions.find((block) => block.startsWith('ImportCopiedEventFunction:')) ?? ''
    const importerLogGroup = functions.find((block) => block.startsWith('ImportCopiedEventFunctionLogGroup:')) ?? ''

    expect(template).not.toMatch(/koekalenteri-prod/)
    expect(exporter.match(/function:koekalenteri-\w+-ImportCopiedEvent/g)).toEqual([
      'function:koekalenteri-test-ImportCopiedEvent',
      'function:koekalenteri-dev-ImportCopiedEvent',
    ])
    expect(importer).toMatch(/^ {4}Condition: IsNotProdStage$/m)
    expect(importerLogGroup).toMatch(/^ {4}Condition: IsNotProdStage$/m)
    expect(template).toMatch(/^ {2}IsNotProdStage: !Not \[!Condition IsProdStage\]$/m)
  })
})

// A lambda that reaches a table its policies do not grant fails here, not in dev (KOE-1492). The
// code side follows calls from each handler's default export (test-utils/lambdaTableUse.ts); the
// template side is the function block's DynamoDB policies, inline statements and managed policies
// (test-utils/templateGrants.ts). The first case of the kind was the user table: outside prod,
// sendTemplatedMail asks it who is staff, and a sender without the read policy failed on the first
// mail it sent in test or dev (KOE-1469); that rule is one of the paths the walk now finds.
describe('table policies', () => {
  const tables = templateTables(template)
  const analysis = analyzeTableUse(handlerDirectories.map((dir) => `src/lambda/${dir}/handler.ts`))

  /** `eventTable` to `EventTable`, and `userTable/index/gsiEmail` to `UserTable/index/gsiEmail`. */
  const grantKey = (useKey: string) => {
    const [key, ...rest] = useKey.split('/')
    const variable = analysis.environmentVariables.get(key)
    const id = variable === undefined ? undefined : tables.environmentVariables.get(variable)
    if (!id) throw new Error(`CONFIG.${key} is not a table the template's Globals name`)
    return [id, ...rest].join('/')
  }

  const usesOf = (name: string, codeUri: string) => {
    const uses = analysis.uses.get(`src/${codeUri}/handler.ts`)
    if (!uses) throw new Error(`${name}: no analysis for ${codeUri}`)
    return uses
  }

  it('grants every function the tables its code reaches', () => {
    const missing: string[] = []
    for (const [name, grants] of tables.functions) {
      for (const [useKey, byAction] of usesOf(name, grants.codeUri)) {
        const key = grantKey(useKey)
        for (const [action, locations] of byAction) {
          if (isGranted(grants.grants, key, action)) continue
          missing.push(`${name} ${action} on ${key} without a policy: ${locations.join(', ')}`)
        }
      }
    }
    expect(missing).toEqual([])
  })

  // The other direction: a grant the code cannot use is a policy nobody can read anything from. Read
  // and write are checked as classes, since the SAM policy templates come in those two sizes.
  it('grants no table a function never reaches', () => {
    const excess: string[] = []
    for (const [name, grants] of tables.functions) {
      const used = new Map<string, Set<string>>()
      for (const [useKey, byAction] of usesOf(name, grants.codeUri))
        used.set(grantKey(useKey), new Set(byAction.keys()))
      for (const { access, table } of unusedGrants(grants.grants, used)) {
        excess.push(`${name} may ${access} ${table} but never does`)
      }
    }
    expect(excess).toEqual([])
  })
})
