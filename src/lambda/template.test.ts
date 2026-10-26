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

const analysis = analyzeTableUse(handlerDirectories.map((dir) => `src/lambda/${dir}/handler.ts`))

// One block per resource, starting at its logical id. A resource line may carry a trailing comment
// (UserLinkTable does).
const resources = template.split(/^ {2}(?=\w+:.*\n {4}Type: )/m)
const resourceName = (block: string) => block.slice(0, block.indexOf(':'))
const resourcesOfType = (type: string) =>
  resources.filter((block) => new RegExp(String.raw`^\w+:.*\n {4}Type: ${type}\s*$`, 'm').test(block))

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

  // The secret every registration, start number and station link is signed with is the stack's SSM
  // parameter, copied unchanged from the Secrets Manager secret it replaced (KOE-1604). A function that
  // resolved anything else would sign links nobody else can open.
  it("signs links with the stack's SSM parameter, and holds no Secrets Manager secret", () => {
    const sources = matchAll(/^ {10}REGISTRATION_EDIT_TOKEN_SECRET: (.+)$/gm)

    expect(sources.length).toBeGreaterThan(0)
    expect(new Set(sources)).toEqual(
      new Set([`!Sub '{{resolve:ssm:\${AWS::StackName}-REGISTRATION_EDIT_TOKEN_SECRET}}'`])
    )
    expect(template).not.toMatch(/secretsmanager/i)
  })

  // A table that holds anything a restore would need gets point-in-time recovery; the data-version
  // table went without it while it held the migration registry (KOE-1597).
  it('has point-in-time recovery on every table but the rebuildable ones', () => {
    const withoutRecovery: Record<string, string> = {
      EventStatsTable: 'the nightly run rebuilds the statistics from the registrations',
      WsConnectionsTable: 'the connections expire on their own and mean nothing after a restore',
    }
    const tables = resourcesOfType('AWS::DynamoDB::Table')
    const recovery = Object.fromEntries(
      tables.map((block) => [resourceName(block), /^ {8}PointInTimeRecoveryEnabled: true$/m.test(block)])
    )

    expect(tables).toHaveLength(template.match(/^ {4}Type: AWS::DynamoDB::Table\s*$/gm)?.length ?? 0)
    expect(Object.keys(withoutRecovery).filter((name) => !(name in recovery))).toEqual([])
    expect(recovery).toEqual(
      Object.fromEntries(Object.keys(recovery).map((name) => [name, !(name in withoutRecovery)]))
    )
  })

  // An alarm is billed per month whether or not anyone hears it. Before KOE-1602 the 13 alarms of each
  // stack had no action at all, so one in ALARM (the data version drift of 24.10.2026) told nobody.
  // Now test has none, and dev's and prod's notify the stack's alarm topic, when they fire and when
  // they clear.
  it('has alarms outside test only, and every alarm notifies the alarm topic', () => {
    const alarms = resourcesOfType('AWS::CloudWatch::Alarm')
    const missing = (pattern: RegExp) => alarms.filter((block) => !pattern.test(block)).map(resourceName)
    const [topic] = resourcesOfType('AWS::SNS::Topic').filter((block) => block.startsWith('AlarmTopic:'))
    const subscriptions = resourcesOfType('AWS::SNS::Subscription').filter((block) =>
      /^ {6}TopicArn: !Ref AlarmTopic$/m.test(block)
    )

    expect(alarms.length).toBeGreaterThan(0)
    expect(alarms).toHaveLength(template.match(/^ {4}Type: AWS::CloudWatch::Alarm\s*$/gm)?.length ?? 0)
    expect(missing(/^ {4}Condition: IsNotTestStage$/m)).toEqual([])
    expect(missing(/^ {6}AlarmActions:\n {8}- !Ref AlarmTopic$/m)).toEqual([])
    expect(missing(/^ {6}OKActions:\n {8}- !Ref AlarmTopic$/m)).toEqual([])
    expect(template).toMatch(/^ {2}IsNotTestStage: !Not \[!Condition IsTestStage\]$/m)

    expect(topic).toMatch(/^ {4}Condition: IsNotTestStage$/m)
    expect(subscriptions).toHaveLength(1)
    expect(subscriptions[0]).toMatch(/^ {4}Condition: SendsAlarmEmail$/m)
    expect(subscriptions[0]).toMatch(/^ {6}Protocol: email$/m)
    expect(subscriptions[0]).toMatch(/^ {6}Endpoint: !Ref AlarmEmail$/m)
  })

  // dev, test and prod are stacks in one account and region. A metric filter that publishes to a
  // namespace every stack shares writes all three stages into one metric, and each stage's alarm then
  // fires on another stage's log lines (dev's data version drift went to ALARM on prod's drift of
  // 25.10.2026). Each filter publishes under its own stack, and an alarm on a custom metric reads the
  // filter's metric there.
  it('publishes every metric filter under its own stack, and alarms read custom metrics from there', () => {
    const stackNamespace = `!Sub 'KoekalenteriApp/\${AWS::StackName}'`
    const filters = resourcesOfType('AWS::Logs::MetricFilter')
    const published = new Map(
      filters.flatMap((block) =>
        [...block.matchAll(/^ {8}- MetricName: (\w+)\n {10}MetricNamespace: (.+)$/gm)].map(([, metric, namespace]) => [
          metric,
          namespace,
        ])
      )
    )
    const customAlarms = resourcesOfType('AWS::CloudWatch::Alarm').flatMap((block) => {
      const namespace = /^ {6}Namespace: (.+)$/m.exec(block)?.[1] ?? ''
      const metric = /^ {6}MetricName: (\w+)$/m.exec(block)?.[1] ?? ''
      return namespace.startsWith('AWS/') ? [] : [{ alarm: resourceName(block), metric, namespace }]
    })
    const misread = customAlarms.filter(
      ({ metric, namespace }) => namespace !== stackNamespace || published.get(metric) !== namespace
    )

    expect(filters).toHaveLength(template.match(/^ {4}Type: AWS::Logs::MetricFilter\s*$/gm)?.length ?? 0)
    expect(published.size).toBe(template.match(/^ {10}MetricNamespace: /gm)?.length ?? 0)
    expect(published.size).toBeGreaterThan(0)
    expect([...published].filter(([, namespace]) => namespace !== stackNamespace)).toEqual([])
    expect(customAlarms.length).toBeGreaterThan(0)
    expect(misread).toEqual([])
  })

  // SSEEnabled: true encrypts a table with the AWS-managed aws/dynamodb KMS key, and DynamoDB then
  // calls KMS on the table's behalf, each request billed (82 000 in October 2026). False keeps the
  // data encrypted at rest with a key AWS owns, at no charge (KOE-1603).
  it('encrypts every table with the AWS-owned key', () => {
    const tables = resourcesOfType('AWS::DynamoDB::Table')
    const ownedKey = Object.fromEntries(
      tables.map((block) => [resourceName(block), /^ {8}SSEEnabled: false$/m.test(block)])
    )

    expect(tables).toHaveLength(template.match(/^ {4}Type: AWS::DynamoDB::Table\s*$/gm)?.length ?? 0)
    expect(ownedKey).toEqual(Object.fromEntries(Object.keys(ownedKey).map((name) => [name, true])))
  })
})

// A lambda that reaches a table its policies do not grant fails here, not in dev (KOE-1492). The
// code side follows calls from each handler's default export and from the module-level code that
// runs at import (test-utils/lambdaTableUse.ts); the template side is the function block's DynamoDB
// policies, inline statements and managed policies (test-utils/templateGrants.ts). The first case of
// the kind was the user table: outside prod, sendTemplatedMail asks it who is staff, and a sender
// without the read policy failed on the first mail it sent in test or dev (KOE-1469); that rule is
// one of the paths the walk now finds.
describe('table policies', () => {
  const tables = templateTables(template)

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

// A variable a function's code reads but its template block does not set is undefined in the deployed
// lambda, and no local test notices: the tests set or stub it. PaymentVerify signed an edit token
// without REGISTRATION_EDIT_TOKEN_SECRET and answered every return from the payment page with an
// error (KOE-1605). CONFIG's reads are left to the table policies above: config.ts runs at import in
// every handler, and its values all fall back to a default.
describe('environment', () => {
  const { functions, globalVariables } = templateTables(template)

  /** Read where nothing in the template sets them, by design. */
  const unset: Record<string, string> = {
    AWS_SAM_LOCAL: 'set by sam local, never in a deployed function',
    NODE_ENV: 'only the tests set it; a deployed function must not take the test fallback',
    PAYTRAIL_API_ENDPOINT: 'the browser tests point it at their fake; deployed, the default is the real one',
    REACT_APP_API_BASE_URL: "the frontend build's; the shared i18n setup reads it, and a lambda has none",
  }

  const readsOf = (codeUri: string) => {
    const reads = new Map<string, string[]>()
    for (const [variable, locations] of analysis.environment.get(`src/${codeUri}/handler.ts`) ?? []) {
      const outside = locations.filter((where) => !where.startsWith('src/lambda/config.ts:'))
      if (outside.length) reads.set(variable, outside)
    }
    return reads
  }

  it('sets every variable a function reads', () => {
    const missing: string[] = []
    for (const [name, { codeUri, environment }] of functions) {
      for (const [variable, locations] of readsOf(codeUri)) {
        if (variable in unset || globalVariables.has(variable) || environment.has(variable)) continue
        missing.push(`${name} reads ${variable} without setting it: ${locations.join(', ')}`)
      }
    }
    expect(missing).toEqual([])
  })

  // The other direction, for the variables the walk sees read: a secret in the environment of a
  // function that never reads it is one more place it can leak from.
  it('sets no variable a function never reads', () => {
    const read = new Set([...functions.values()].flatMap(({ codeUri }) => [...readsOf(codeUri).keys()]))
    const excess: string[] = []
    for (const [name, { codeUri, environment }] of functions) {
      const reads = readsOf(codeUri)
      for (const variable of environment) {
        if (read.has(variable) && !reads.has(variable)) excess.push(`${name} sets ${variable} but never reads it`)
      }
    }
    expect(excess).toEqual([])
  })
})
