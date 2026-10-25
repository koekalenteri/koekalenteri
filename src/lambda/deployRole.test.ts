import type { PolicyStatement, RequestContext } from './test-utils/iamPolicy'
import { readFileSync } from 'node:fs'
import {
  buildAppTemplate,
  isRecord,
  listField,
  parseTaggedTemplate,
  recordField,
  resolveIntrinsics,
} from './test-utils/cloudFormationYaml'
import { isAllowed, policyStatements } from './test-utils/iamPolicy'

/**
 * The deploy role's permissions are written out in aws/github-deploy-role.yaml (KOE-1572). A
 * permission it lacks shows up only as a failed deploy, so this asks the policies, the way IAM
 * would, for every call a deploy makes: what release.yml calls, and what CloudFormation calls for
 * each resource the app template creates, in each of the three stacks. A resource type, a name or a
 * policy the role does not cover fails here first.
 */

const ACCOUNT = '123456789012'
const REGION = 'eu-north-1'
const ENVIRONMENTS = ['dev', 'test', 'prod'] as const
type Environment = (typeof ENVIRONMENTS)[number]

const DEPLOY_ROLE = `arn:aws:iam::${ACCOUNT}:role/koekalenteri-github-deploy`
const BOUNDARY = `arn:aws:iam::${ACCOUNT}:policy/koekalenteri-app-boundary`
/** What CloudFormation appends to a name it generates, and what stands in for the ids AWS assigns. */
const SUFFIX = 'A1B2C3D4E5F6'
const ID = 'abc123'

const asString = (value: unknown, where: string): string => {
  if (typeof value !== 'string') throw new Error(`${where}: ${JSON.stringify(value)} is not a string`)
  return value
}

// --- the deploy role ---

const roleTemplate = parseTaggedTemplate(readFileSync('aws/github-deploy-role.yaml', 'utf8'))
const roleResources = recordField(roleTemplate, 'Resources')
const roleRefs: Record<string, string> = {
  AppBoundary: BOUNDARY,
  'AWS::AccountId': ACCOUNT,
  'AWS::Region': REGION,
  DeployRole: 'koekalenteri-github-deploy',
  'DeployRole.Arn': DEPLOY_ROLE,
  Repository: 'koekalenteri/koekalenteri',
}
const resolveRole = (value: unknown) => resolveIntrinsics(value, (name) => roleRefs[name])

const deployRole = recordField(recordField(roleResources, 'DeployRole'), 'Properties')
const deployStatements = Object.entries(roleResources).flatMap(([id, resource]) => {
  if (!isRecord(resource) || resource.Type !== 'AWS::IAM::ManagedPolicy') return []
  const properties = recordField(resource, 'Properties')
  const attached = listField(properties, 'Roles').some((role) => isRecord(role) && role.Ref === 'DeployRole')
  return attached ? policyStatements(resolveRole(properties.PolicyDocument), id) : []
})

const allowed = (action: string, resource: string, context: RequestContext = {}) =>
  isAllowed(deployStatements, action, resource, context)

const bounded = { 'iam:PermissionsBoundary': BOUNDARY }

// --- the app template, with what SAM expands it to ---

interface Resource {
  id: string
  type: string
  properties: Record<string, unknown>
}

const app = parseTaggedTemplate(buildAppTemplate())
const appResources = recordField(app, 'Resources')
const appParameters = recordField(app, 'Parameters')
const functionGlobals = recordField(recordField(app, 'Globals'), 'Function')
const LAMBDA_BASIC_EXECUTION = 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'

/** The managed policies SAM attaches to a function's role: the basic execution one and its `Policies` that are ARNs. */
const functionManagedPolicies = (properties: Record<string, unknown>): unknown[] => [
  LAMBDA_BASIC_EXECUTION,
  ...listField(properties, 'Policies').filter((policy) => {
    if (typeof policy === 'string') return true
    if (!isRecord(policy)) return false
    const target = typeof policy.Ref === 'string' ? recordField(appResources, policy.Ref) : {}
    return target.Type === 'AWS::IAM::ManagedPolicy'
  }),
]

/**
 * The resources SAM writes for a function: the function, its role unless it names one, a permission
 * per API or SNS event, a subscription per SNS event, and a schedule with a role of its own per
 * ScheduleV2 event. An event type not listed here throws.
 */
const expandFunction = (id: string, properties: Record<string, unknown>): Resource[] => {
  if (properties.Role !== undefined) throw new Error(`${id}: a function with a Role of its own is not handled`)
  const expanded: Resource[] = [
    {
      id,
      properties: { FunctionName: properties.FunctionName, Role: { GetAtt: `${id}Role.Arn` } },
      type: 'AWS::Lambda::Function',
    },
    {
      id: `${id}Role`,
      properties: {
        ManagedPolicyArns: functionManagedPolicies(properties),
        PermissionsBoundary: properties.PermissionsBoundary ?? functionGlobals.PermissionsBoundary,
      },
      type: 'AWS::IAM::Role',
    },
  ]
  for (const [eventId, event] of Object.entries(recordField(properties, 'Events'))) {
    const eventType = isRecord(event) ? event.Type : undefined
    const eventProperties = isRecord(event) ? recordField(event, 'Properties') : {}
    const permission = { properties: { FunctionName: { Ref: id } }, type: 'AWS::Lambda::Permission' }
    if (eventType === 'Api') {
      expanded.push({ id: `${id}${eventId}Permission`, ...permission })
    } else if (eventType === 'SNS') {
      expanded.push(
        { id: `${id}${eventId}Permission`, ...permission },
        { id: `${id}${eventId}`, properties: { TopicArn: eventProperties.Topic }, type: 'AWS::SNS::Subscription' }
      )
    } else if (eventType === 'ScheduleV2') {
      expanded.push(
        { id: `${id}${eventId}`, properties: { Name: eventProperties.Name }, type: 'AWS::Scheduler::Schedule' },
        {
          id: `${id}${eventId}Role`,
          properties: { PermissionsBoundary: eventProperties.PermissionsBoundary },
          type: 'AWS::IAM::Role',
        }
      )
    } else {
      throw new Error(`${id}: event ${eventId} of type ${String(eventType)} is not handled`)
    }
  }
  return expanded
}

/** The REST API with its deployment and stage, and the usage plan and key Globals.Api asks for. */
const expandApi = (id: string): Resource[] =>
  [
    ['', 'AWS::ApiGateway::RestApi'],
    ['Deployment', 'AWS::ApiGateway::Deployment'],
    ['Stage', 'AWS::ApiGateway::Stage'],
    ['UsagePlan', 'AWS::ApiGateway::UsagePlan'],
    ['ApiKey', 'AWS::ApiGateway::ApiKey'],
    ['UsagePlanKey', 'AWS::ApiGateway::UsagePlanKey'],
  ].map(([suffix, type]) => ({ id: `${id}${suffix}`, properties: {}, type }))

const resources: Resource[] = Object.entries(appResources).flatMap(([id, resource]) => {
  if (!isRecord(resource)) throw new Error(`${id} is not a map`)
  const properties = recordField(resource, 'Properties')
  const type = asString(resource.Type, id)
  if (type === 'AWS::Serverless::Function') return expandFunction(id, properties)
  if (type === 'AWS::Serverless::Api') return expandApi(id)
  if (type.startsWith('AWS::Serverless::')) throw new Error(`${id}: ${type} is not expanded`)
  return [{ id, properties, type }]
})
const byId = new Map(resources.map((resource) => [resource.id, resource]))

// --- names and ARNs in one stack ---

const NAME_PROPERTY: Record<string, string> = {
  'AWS::CloudWatch::Alarm': 'AlarmName',
  'AWS::DynamoDB::Table': 'TableName',
  'AWS::IAM::ManagedPolicy': 'ManagedPolicyName',
  'AWS::IAM::Role': 'RoleName',
  'AWS::Lambda::Function': 'FunctionName',
  'AWS::Logs::LogGroup': 'LogGroupName',
  'AWS::RUM::AppMonitor': 'Name',
  'AWS::S3::Bucket': 'BucketName',
  'AWS::Scheduler::Schedule': 'Name',
  'AWS::SecretsManager::Secret': 'Name',
  'AWS::SNS::Topic': 'TopicName',
}

class Stack {
  readonly name: string

  constructor(readonly environment: Environment) {
    this.name = `koekalenteri-${environment}`
  }

  resolve = (value: unknown): unknown => resolveIntrinsics(value, this.ref)

  string = (value: unknown, where: string) => asString(this.resolve(value), where)

  private readonly ref = (target: string): string | undefined => {
    const pseudo: Record<string, string> = {
      'AWS::AccountId': ACCOUNT,
      'AWS::Partition': 'aws',
      'AWS::Region': REGION,
      'AWS::StackName': this.name,
      'AWS::URLSuffix': 'amazonaws.com',
      Branch: 'main',
      StageNameParam: this.environment,
    }
    if (target in pseudo) return pseudo[target]
    const [id, attribute] = target.split('.')
    if (attribute !== undefined) return attribute === 'Arn' ? this.arn(id) : `${id}-${attribute}`
    if (id in appParameters) {
      const fallback = recordField(appParameters, id).Default
      return typeof fallback === 'string' ? fallback : `${id}-value`
    }
    return byId.has(id) ? this.refOf(id) : undefined
  }

  /** The name CloudFormation gives a resource: its name property, or one it generates. */
  physicalName(id: string): string {
    const resource = this.resource(id)
    const property = NAME_PROPERTY[resource.type]
    const named = property === undefined ? undefined : resource.properties[property]
    if (named !== undefined) return this.string(named, `${id}.${property}`)
    // A secret's generated name starts with its logical id, every other one with the stack name.
    if (resource.type === 'AWS::SecretsManager::Secret') return `${id}-${SUFFIX}`
    return `${this.name}-${id}-${SUFFIX}`
  }

  private resource(id: string): Resource {
    const resource = byId.get(id)
    if (!resource) throw new Error(`${id} is not a resource of the template`)
    return resource
  }

  /** What `!Ref` answers: an ARN for the types whose Ref is one, an id for the generated ones, else the name. */
  private refOf(id: string): string {
    const type = this.resource(id).type
    if (['AWS::IAM::ManagedPolicy', 'AWS::SNS::Topic', 'AWS::SecretsManager::Secret'].includes(type)) {
      return this.arn(id)
    }
    if (type === 'AWS::Cognito::UserPool') return `${REGION}_${ID}`
    if (type === 'AWS::Cognito::IdentityPool') return `${REGION}:${ID}`
    if (type.startsWith('AWS::ApiGateway') || type.startsWith('AWS::Amplify::')) return ID
    return this.physicalName(id)
  }

  arn(id: string): string {
    const resource = this.resource(id)
    const name = () => this.physicalName(id)
    const regional = (service: string, rest: string) => `arn:aws:${service}:${REGION}:${ACCOUNT}:${rest}`
    switch (resource.type) {
      case 'AWS::CloudWatch::Alarm':
        return regional('cloudwatch', `alarm:${name()}`)
      case 'AWS::Cognito::IdentityPool':
        return regional('cognito-identity', `identitypool/${REGION}:${ID}`)
      case 'AWS::Cognito::UserPool':
        return regional('cognito-idp', `userpool/${REGION}_${ID}`)
      case 'AWS::DynamoDB::Table':
        return regional('dynamodb', `table/${name()}`)
      case 'AWS::IAM::ManagedPolicy':
        return `arn:aws:iam::${ACCOUNT}:policy/${name()}`
      case 'AWS::IAM::Role':
        return `arn:aws:iam::${ACCOUNT}:role/${name()}`
      case 'AWS::Lambda::Function':
        return regional('lambda', `function:${name()}`)
      case 'AWS::Logs::LogGroup':
        return regional('logs', `log-group:${name()}:*`)
      case 'AWS::RUM::AppMonitor':
        return regional('rum', `appmonitor/${name()}`)
      case 'AWS::S3::Bucket':
        return `arn:aws:s3:::${name()}`
      case 'AWS::Scheduler::Schedule':
        return regional('scheduler', `schedule/default/${name()}`)
      case 'AWS::SecretsManager::Secret':
        return regional('secretsmanager', `secret:${name()}-AbCdEf`)
      case 'AWS::SNS::Topic':
        return regional('sns', name())
      default:
        throw new Error(`${id}: no ARN for ${resource.type}`)
    }
  }

  functionArn(value: unknown, where: string): string {
    const name = this.string(value, where)
    return name.startsWith('arn:') ? name : `arn:aws:lambda:${REGION}:${ACCOUNT}:function:${name}`
  }

  logGroupArn(value: unknown, where: string): string {
    return `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${this.string(value, where)}:*`
  }
}

// --- the calls CloudFormation makes for each resource type ---

interface Call {
  action: string
  resource: string
  context?: RequestContext
}

const each = (actions: string[], resource: string, context?: RequestContext): Call[] =>
  actions.map((action) => ({ action, context, resource }))

const regionalArn = (service: string, rest: string) => `arn:aws:${service}:${REGION}:${ACCOUNT}:${rest}`
const apiGatewayArn = (path: string) => `arn:aws:apigateway:${REGION}::${path}`
const API_GATEWAY_VERBS = [
  'apigateway:DELETE',
  'apigateway:GET',
  'apigateway:PATCH',
  'apigateway:POST',
  'apigateway:PUT',
]
const USER_POOL_ARN = regionalArn('cognito-idp', `userpool/${REGION}_${ID}`)
const IDENTITY_POOL_ARN = regionalArn('cognito-identity', `identitypool/${REGION}:${ID}`)
const AMPLIFY_APP_ARN = regionalArn('amplify', `apps/${ID}`)

const roleCalls = (resource: Resource, stack: Stack): Call[] => {
  const arn = stack.arn(resource.id)
  const boundary = resource.properties.PermissionsBoundary
  const context: RequestContext =
    boundary === undefined ? {} : { 'iam:PermissionsBoundary': stack.string(boundary, resource.id) }
  const attachments = listField(resource.properties, 'ManagedPolicyArns').map((policy) => ({
    action: 'iam:AttachRolePolicy',
    context: { ...context, 'iam:PolicyARN': stack.string(policy, `${resource.id}.ManagedPolicyArns`) },
    resource: arn,
  }))
  return [
    ...each(
      [
        'iam:CreateRole',
        'iam:DeleteRolePolicy',
        'iam:DetachRolePolicy',
        'iam:PutRolePermissionsBoundary',
        'iam:PutRolePolicy',
      ],
      arn,
      context
    ),
    ...attachments,
    ...each(
      [
        'iam:DeleteRole',
        'iam:GetRole',
        'iam:GetRolePolicy',
        'iam:ListAttachedRolePolicies',
        'iam:ListRolePolicies',
        'iam:TagRole',
        'iam:UntagRole',
        'iam:UpdateAssumeRolePolicy',
      ],
      arn
    ),
  ]
}

const CALLS: Record<string, (resource: Resource, stack: Stack) => Call[]> = {
  'AWS::Amplify::App': (resource, stack) => [
    ...each(['amplify:CreateApp'], '*'),
    ...each(['amplify:DeleteApp', 'amplify:GetApp', 'amplify:TagResource', 'amplify:UpdateApp'], AMPLIFY_APP_ARN),
    ...each(['iam:PassRole'], stack.string(resource.properties.IAMServiceRole, `${resource.id}.IAMServiceRole`)),
  ],
  'AWS::Amplify::Branch': (resource, stack) =>
    each(
      ['amplify:CreateBranch', 'amplify:DeleteBranch', 'amplify:GetBranch', 'amplify:UpdateBranch'],
      `${AMPLIFY_APP_ARN}/branches/${stack.string(resource.properties.BranchName, `${resource.id}.BranchName`)}`
    ),
  'AWS::ApiGateway::ApiKey': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/apikeys/${ID}`)),
  'AWS::ApiGateway::Deployment': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/restapis/${ID}/deployments/${ID}`)),
  'AWS::ApiGateway::RestApi': () =>
    each([...API_GATEWAY_VERBS, 'apigateway:UpdateRestApiPolicy'], apiGatewayArn(`/restapis/${ID}`)),
  'AWS::ApiGateway::Stage': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/restapis/${ID}/stages/${ID}`)),
  'AWS::ApiGateway::UsagePlan': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/usageplans/${ID}`)),
  'AWS::ApiGateway::UsagePlanKey': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/usageplans/${ID}/keys/${ID}`)),
  'AWS::ApiGatewayV2::Api': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/apis/${ID}`)),
  'AWS::ApiGatewayV2::Integration': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/apis/${ID}/integrations/${ID}`)),
  'AWS::ApiGatewayV2::Route': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/apis/${ID}/routes/${ID}`)),
  'AWS::ApiGatewayV2::RouteResponse': () =>
    each(API_GATEWAY_VERBS, apiGatewayArn(`/apis/${ID}/routes/${ID}/routeresponses/${ID}`)),
  'AWS::ApiGatewayV2::Stage': () => each(API_GATEWAY_VERBS, apiGatewayArn(`/apis/${ID}/stages/${ID}`)),
  'AWS::CloudWatch::Alarm': (resource, stack) =>
    each(
      ['cloudwatch:DeleteAlarms', 'cloudwatch:DescribeAlarms', 'cloudwatch:PutMetricAlarm', 'cloudwatch:TagResource'],
      stack.arn(resource.id)
    ),
  'AWS::Cognito::IdentityPool': () => [
    ...each(['cognito-identity:CreateIdentityPool'], '*'),
    ...each(
      [
        'cognito-identity:DeleteIdentityPool',
        'cognito-identity:DescribeIdentityPool',
        'cognito-identity:TagResource',
        'cognito-identity:UpdateIdentityPool',
      ],
      IDENTITY_POOL_ARN
    ),
  ],
  'AWS::Cognito::IdentityPoolRoleAttachment': (resource, stack) => [
    ...each(['cognito-identity:GetIdentityPoolRoles'], IDENTITY_POOL_ARN),
    // IAM authorizes it on no resource
    ...each(['cognito-identity:SetIdentityPoolRoles'], '*'),
    ...Object.values(recordField(resource.properties, 'Roles')).flatMap((role) =>
      each(['iam:PassRole'], stack.string(role, `${resource.id}.Roles`))
    ),
  ],
  'AWS::Cognito::UserPool': () => [
    ...each(['cognito-idp:CreateUserPool'], '*'),
    ...each(
      [
        'cognito-idp:DeleteUserPool',
        'cognito-idp:DescribeUserPool',
        'cognito-idp:SetUserPoolMfaConfig',
        'cognito-idp:TagResource',
        'cognito-idp:UpdateUserPool',
      ],
      USER_POOL_ARN
    ),
  ],
  'AWS::Cognito::UserPoolClient': () =>
    each(
      [
        'cognito-idp:CreateUserPoolClient',
        'cognito-idp:DeleteUserPoolClient',
        'cognito-idp:DescribeUserPoolClient',
        'cognito-idp:ListUserPoolClientSecrets',
        'cognito-idp:UpdateUserPoolClient',
      ],
      USER_POOL_ARN
    ),
  'AWS::Cognito::UserPoolDomain': () => [
    ...each(
      ['cognito-idp:CreateUserPoolDomain', 'cognito-idp:DeleteUserPoolDomain', 'cognito-idp:UpdateUserPoolDomain'],
      USER_POOL_ARN
    ),
    // IAM authorizes it on no resource
    ...each(['cognito-idp:DescribeUserPoolDomain'], '*'),
  ],
  'AWS::Cognito::UserPoolIdentityProvider': () =>
    each(
      [
        'cognito-idp:CreateIdentityProvider',
        'cognito-idp:DeleteIdentityProvider',
        'cognito-idp:DescribeIdentityProvider',
        'cognito-idp:UpdateIdentityProvider',
      ],
      USER_POOL_ARN
    ),
  'AWS::DynamoDB::Table': (resource, stack) =>
    each(
      [
        'dynamodb:CreateTable',
        'dynamodb:DeleteTable',
        'dynamodb:DescribeContinuousBackups',
        'dynamodb:DescribeTable',
        'dynamodb:DescribeTimeToLive',
        'dynamodb:TagResource',
        'dynamodb:UntagResource',
        'dynamodb:UpdateContinuousBackups',
        'dynamodb:UpdateTable',
        'dynamodb:UpdateTimeToLive',
      ],
      stack.arn(resource.id)
    ),
  'AWS::IAM::ManagedPolicy': (resource, stack) =>
    each(
      [
        'iam:CreatePolicy',
        'iam:CreatePolicyVersion',
        'iam:DeletePolicy',
        'iam:DeletePolicyVersion',
        'iam:GetPolicy',
        'iam:GetPolicyVersion',
        'iam:ListPolicyVersions',
      ],
      stack.arn(resource.id)
    ),
  'AWS::IAM::Role': roleCalls,
  'AWS::Lambda::Function': (resource, stack) => [
    ...each(
      [
        'lambda:CreateFunction',
        'lambda:DeleteFunction',
        'lambda:GetFunction',
        'lambda:TagResource',
        'lambda:UpdateFunctionCode',
        'lambda:UpdateFunctionConfiguration',
      ],
      stack.arn(resource.id)
    ),
    ...each(['iam:PassRole'], stack.string(resource.properties.Role, `${resource.id}.Role`)),
  ],
  'AWS::Lambda::Permission': (resource, stack) =>
    each(
      ['lambda:AddPermission', 'lambda:GetPolicy', 'lambda:RemovePermission'],
      stack.functionArn(resource.properties.FunctionName, `${resource.id}.FunctionName`)
    ),
  'AWS::Logs::LogGroup': (resource, stack) =>
    each(
      ['logs:CreateLogGroup', 'logs:DeleteLogGroup', 'logs:PutRetentionPolicy', 'logs:TagResource'],
      stack.arn(resource.id)
    ).concat(each(['logs:DescribeIndexPolicies'], '*')),
  'AWS::Logs::MetricFilter': (resource, stack) =>
    each(
      ['logs:DeleteMetricFilter', 'logs:PutMetricFilter'],
      stack.logGroupArn(resource.properties.LogGroupName, `${resource.id}.LogGroupName`)
    ),
  'AWS::RUM::AppMonitor': (resource, stack) =>
    each(
      ['rum:CreateAppMonitor', 'rum:DeleteAppMonitor', 'rum:GetAppMonitor', 'rum:TagResource', 'rum:UpdateAppMonitor'],
      stack.arn(resource.id)
    ).concat(each(['rum:ListTagsForResource'], '*')),
  'AWS::S3::Bucket': (resource, stack) =>
    each(
      [
        's3:CreateBucket',
        's3:DeleteBucket',
        's3:GetBucketTagging',
        's3:GetEncryptionConfiguration',
        's3:GetLifecycleConfiguration',
        's3:PutBucketCORS',
        's3:PutBucketLogging',
        's3:PutBucketOwnershipControls',
        's3:PutBucketPublicAccessBlock',
        's3:PutBucketTagging',
        's3:PutBucketVersioning',
        's3:PutEncryptionConfiguration',
        's3:PutLifecycleConfiguration',
      ],
      stack.arn(resource.id)
    ),
  'AWS::S3::BucketPolicy': (resource, stack) =>
    each(
      ['s3:DeleteBucketPolicy', 's3:GetBucketPolicy', 's3:PutBucketPolicy'],
      `arn:aws:s3:::${stack.string(resource.properties.Bucket, `${resource.id}.Bucket`)}`
    ),
  'AWS::Scheduler::Schedule': (resource, stack) =>
    each(
      ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule', 'scheduler:GetSchedule', 'scheduler:UpdateSchedule'],
      stack.arn(resource.id)
    ),
  'AWS::SES::ConfigurationSetEventDestination': (resource, stack) => [
    ...each(
      [
        'ses:CreateConfigurationSetEventDestination',
        'ses:DeleteConfigurationSetEventDestination',
        'ses:GetConfigurationSetEventDestinations',
        'ses:UpdateConfigurationSetEventDestination',
      ],
      regionalArn(
        'ses',
        `configuration-set/${stack.string(resource.properties.ConfigurationSetName, `${resource.id}.ConfigurationSetName`)}`
      )
    ),
    // IAM authorizes it on no resource
    ...each(['ses:DescribeConfigurationSet'], '*'),
  ],
  'AWS::SecretsManager::Secret': (resource, stack) => [
    ...each(
      [
        'secretsmanager:CreateSecret',
        'secretsmanager:DeleteSecret',
        'secretsmanager:DescribeSecret',
        'secretsmanager:TagResource',
        'secretsmanager:UpdateSecret',
      ],
      stack.arn(resource.id)
    ),
    ...each(['secretsmanager:GetRandomPassword'], '*'),
    // The functions' {{resolve:secretsmanager:...}} references, resolved with the role's credentials
    ...each(['secretsmanager:GetSecretValue'], stack.arn(resource.id)),
    ...each(['kms:Decrypt'], regionalArn('kms', `key/${ID}`), {
      'kms:CallerAccount': ACCOUNT,
      'kms:ViaService': `secretsmanager.${REGION}.amazonaws.com`,
    }),
  ],
  'AWS::SNS::Subscription': (resource, stack) => {
    const topic = stack.string(resource.properties.TopicArn, `${resource.id}.TopicArn`)
    return [
      ...each(['sns:Subscribe'], topic),
      // IAM authorizes these on no resource
      ...each(['sns:GetSubscriptionAttributes', 'sns:SetSubscriptionAttributes', 'sns:Unsubscribe'], '*'),
    ]
  },
  'AWS::SNS::Topic': (resource, stack) =>
    each(
      ['sns:CreateTopic', 'sns:DeleteTopic', 'sns:GetTopicAttributes', 'sns:SetTopicAttributes', 'sns:TagResource'],
      stack.arn(resource.id)
    ),
  'AWS::SNS::TopicPolicy': (resource, stack) =>
    listField(resource.properties, 'Topics').flatMap((topic) =>
      each(['sns:SetTopicAttributes'], stack.string(topic, `${resource.id}.Topics`))
    ),
}

// --- what the app's roles are given, against the boundary ---

const boundaryStatements = policyStatements(
  resolveRole(recordField(recordField(roleResources, 'AppBoundary'), 'Properties').PolicyDocument),
  'AppBoundary'
)

/** Actions on resources, as one statement of a role's policy gives them. */
interface Grant {
  actions: string[]
  resources: string[]
  where: string
}

type TemplateGrant = Omit<Grant, 'where'>

const tableGrant =
  (actions: string[], index: boolean) =>
  (parameters: Record<string, unknown>, stack: Stack): TemplateGrant[] => {
    const table = regionalArn('dynamodb', `table/${stack.string(parameters.TableName, 'TableName')}`)
    return [
      {
        actions: actions.map((action) => `dynamodb:${action}`),
        resources: index ? [table, `${table}/index/*`] : [table],
      },
    ]
  }

/**
 * Every action of a bucket template on the bucket and on its objects. SAM writes S3ReadPolicy that
 * way and S3FullAccessPolicy as two statements (object actions on bucket/*, the bucket ones on the
 * bucket); the test checks the superset on purpose, which the boundary must allow either way.
 */
const bucketGrants =
  (bucketActions: string[], objectActions: string[]) =>
  (parameters: Record<string, unknown>, stack: Stack): TemplateGrant[] => {
    const bucket = `arn:aws:s3:::${stack.string(parameters.BucketName, 'BucketName')}`
    return [
      {
        actions: [...bucketActions, ...objectActions].map((action) => `s3:${action}`),
        resources: [bucket, `${bucket}/*`],
      },
    ]
  }

/**
 * The SAM policy templates the functions use, with the statements SAM writes for them
 * (samtranslator/policy_templates_data/policy_templates.json). A template not listed here throws.
 */
const POLICY_TEMPLATES: Record<string, (parameters: Record<string, unknown>, stack: Stack) => TemplateGrant[]> = {
  CloudWatchPutMetricPolicy: () => [{ actions: ['cloudwatch:PutMetricData'], resources: ['*'] }],
  DynamoDBCrudPolicy: tableGrant(
    [
      'BatchGetItem',
      'BatchWriteItem',
      'ConditionCheckItem',
      'DeleteItem',
      'DescribeTable',
      'GetItem',
      'PutItem',
      'Query',
      'Scan',
      'UpdateItem',
    ],
    true
  ),
  DynamoDBReadPolicy: tableGrant(['BatchGetItem', 'DescribeTable', 'GetItem', 'Query', 'Scan'], true),
  DynamoDBWritePolicy: tableGrant(['BatchWriteItem', 'PutItem', 'UpdateItem'], false),
  S3FullAccessPolicy: bucketGrants(
    ['GetBucketLocation', 'GetLifecycleConfiguration', 'ListBucket', 'PutLifecycleConfiguration'],
    [
      'DeleteObject',
      'DeleteObjectTagging',
      'DeleteObjectVersionTagging',
      'GetObject',
      'GetObjectAcl',
      'GetObjectTagging',
      'GetObjectVersion',
      'GetObjectVersionTagging',
      'PutObject',
      'PutObjectAcl',
      'PutObjectTagging',
      'PutObjectVersionTagging',
    ]
  ),
  S3ReadPolicy: bucketGrants(
    ['GetBucketLocation', 'GetLifecycleConfiguration', 'ListBucket'],
    ['GetObject', 'GetObjectVersion']
  ),
}

const API_GATEWAY_PUSH = 'arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs'

/** The AWS managed policies the template attaches, with the resources their calls name in a stack. */
const awsManagedGrants = (arn: string, logGroup: string, stack: Stack, where: string): Grant[] => {
  const logs = (name: string) => regionalArn('logs', `log-group:${name}:*`)
  if (arn === LAMBDA_BASIC_EXECUTION) {
    return [
      {
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [logs(logGroup)],
        where,
      },
    ]
  }
  if (arn === API_GATEWAY_PUSH) {
    return [
      {
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:FilterLogEvents',
          'logs:GetLogEvents',
          'logs:PutLogEvents',
        ],
        resources: [
          logs(`API-Gateway-Execution-Logs_${ID}/${stack.environment}`),
          logs(`/aws/apigateway/AccessLog-${stack.environment}-${ID}`),
        ],
        where,
      },
      { actions: ['logs:DescribeLogGroups', 'logs:DescribeLogStreams'], resources: ['*'], where },
    ]
  }
  throw new Error(`${where}: the AWS managed policy ${arn} is not modelled`)
}

const documentGrants = (document: unknown, stack: Stack, where: string): Grant[] =>
  listField(isRecord(document) ? document : {}, 'Statement').flatMap((statement, index) => {
    const at = `${where} statement ${index}`
    if (!isRecord(statement)) throw new Error(`${at} is not a map`)
    if (statement.Effect !== 'Allow') return []
    return [
      {
        actions: listField(statement, 'Action').map((action) => asString(action, at)),
        resources: listField(statement, 'Resource').map((resource) => stack.string(resource, at)),
        where: at,
      },
    ]
  })

const managedPolicyDocument = (id: string) => recordField(recordField(appResources, id), 'Properties').PolicyDocument

const functionPolicyGrants = (id: string, policy: unknown, stack: Stack): Grant[] => {
  const where = `${id}.Policies`
  if (!isRecord(policy)) throw new Error(`${where}: ${JSON.stringify(policy)} is not modelled`)
  if (typeof policy.Ref === 'string') {
    return documentGrants(managedPolicyDocument(policy.Ref), stack, `${where} ${policy.Ref}`)
  }
  if (policy.Statement !== undefined) return documentGrants(policy, stack, where)
  const [name, ...rest] = Object.keys(policy)
  const template = POLICY_TEMPLATES[name]
  if (template === undefined || rest.length > 0) throw new Error(`${where}: policy template ${name} is not modelled`)
  return template(recordField(policy, name), stack).map((grant) => ({ ...grant, where: `${where} ${name}` }))
}

const serverlessFunctionGrants = (id: string, properties: Record<string, unknown>, stack: Stack): Grant[] => {
  const functionArn = stack.arn(id)
  const schedules = Object.entries(recordField(properties, 'Events'))
    .filter(([, event]) => isRecord(event) && event.Type === 'ScheduleV2')
    .map(([eventId]) => ({ actions: ['lambda:InvokeFunction'], resources: [functionArn], where: `${id}.${eventId}` }))
  return [
    ...awsManagedGrants(LAMBDA_BASIC_EXECUTION, `/aws/lambda/${stack.physicalName(id)}`, stack, id),
    ...listField(properties, 'Policies').flatMap((policy) => functionPolicyGrants(id, policy, stack)),
    ...schedules,
  ]
}

const roleResourceGrants = (id: string, properties: Record<string, unknown>, stack: Stack): Grant[] => [
  ...listField(properties, 'Policies').flatMap((policy) =>
    documentGrants(isRecord(policy) ? policy.PolicyDocument : undefined, stack, `${id}.Policies`)
  ),
  ...listField(properties, 'ManagedPolicyArns').flatMap((arn) =>
    awsManagedGrants(stack.string(arn, `${id}.ManagedPolicyArns`), '', stack, id)
  ),
]

/** Everything the template's policies give its roles in one stack, SAM's implicit roles included. */
const roleGrants = (stack: Stack): Grant[] =>
  Object.entries(appResources).flatMap(([id, resource]) => {
    if (!isRecord(resource)) return []
    const properties = recordField(resource, 'Properties')
    if (resource.Type === 'AWS::Serverless::Function') return serverlessFunctionGrants(id, properties, stack)
    if (resource.Type === 'AWS::IAM::Role') return roleResourceGrants(id, properties, stack)
    return []
  })

/**
 * The SSM reads are granted on `*` in the template, but the boundary names the parameters, and
 * the parameter test below checks the names secrets.ts reads instead.
 */
const NAMED_BY_THE_PARAMETER_TEST = new Set(['ssm:GetParameter', 'ssm:GetParameters'])

/** A grant on `*` needs the boundary to allow the action on `*` too, the way IAM decides it. */
const boundaryRefuses = (grants: Grant[]) =>
  grants.flatMap((grant) =>
    grant.actions.flatMap((action) =>
      grant.resources
        .filter(
          (resource) =>
            !(resource === '*' && NAMED_BY_THE_PARAMETER_TEST.has(action)) &&
            !isAllowed(boundaryStatements, action, resource)
        )
        .map((resource) => `${grant.where}: ${action} ${resource}`)
    )
  )

/** The SSM parameters the functions read, from src/lambda/lib/secrets.ts: shared names and per-stack ones. */
const ssmParameters = () => {
  const source = readFileSync('src/lambda/lib/secrets.ts', 'utf8')
  const calls = [...source.matchAll(/getSSMParams(?:<\w+>)?\(\[([^\]]*)\]\)/g)].map((match) => match[1])
  return {
    calls: calls.length,
    shared: calls.flatMap((call) => [...call.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((match) => match[1])),
    stacked: [...source.matchAll(/`\$\{stackName\}-([A-Z][A-Z0-9_]*)`/g)].map((match) => match[1]),
  }
}

const KEY = regionalArn('kms', 'key/1234abcd-12ab-34cd-56ef-1234567890ab')
const OTHER_ACCOUNT = '999999999999'
/** The KMS context of a decrypt a service makes for a caller of the given account. */
const through = (service: string, account = ACCOUNT): RequestContext => ({
  'kms:CallerAccount': account,
  'kms:ViaService': `${service}.${REGION}.amazonaws.com`,
})

const denied = (calls: Call[]) =>
  calls
    .filter((call) => !allowed(call.action, call.resource, call.context))
    .map((call) => `${call.action} ${call.resource}${call.context ? ` ${JSON.stringify(call.context)}` : ''}`)

describe('the deploy role', () => {
  it('has its permissions in the template', () => {
    expect(Object.keys(recordField(roleTemplate, 'Parameters'))).not.toContain('ManagedPolicyArns')
    expect(deployRole.ManagedPolicyArns).toBeUndefined()
    expect(deployRole.Policies).toBeUndefined()
    expect(deployStatements.length).toBeGreaterThan(0)
  })

  // IAM refuses a managed policy over 6144 characters, whitespace not counted, and the stack with it.
  it('keeps every policy within the managed policy size limit', () => {
    const sizes = Object.entries(roleResources).flatMap(([id, resource]) =>
      isRecord(resource) && resource.Type === 'AWS::IAM::ManagedPolicy'
        ? [
            [
              id,
              JSON.stringify(resolveRole(recordField(resource, 'Properties').PolicyDocument)).replaceAll(/\s/g, '')
                .length,
            ],
          ]
        : []
    )

    expect(sizes.length).toBeGreaterThan(1)
    expect(sizes.filter(([, size]) => Number(size) > 6144)).toEqual([])
  })

  it('is assumed only by the jobs of the three deployment environments', () => {
    const statements = listField(recordField(deployRole, 'AssumeRolePolicyDocument'), 'Statement')
    const statement = isRecord(statements[0]) ? statements[0] : {}
    const condition = resolveRole(statement.Condition)

    expect(statements).toHaveLength(1)
    expect(isRecord(condition) ? condition.StringEquals : undefined).toEqual({
      'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
      'token.actions.githubusercontent.com:sub': [
        'repo:koekalenteri/koekalenteri:environment:dev',
        'repo:koekalenteri/koekalenteri:environment:test',
        'repo:koekalenteri/koekalenteri:environment:prod',
      ],
    })
  })

  it.each(ENVIRONMENTS)('makes the calls release.yml makes in %s', (environment) => {
    const stack = `koekalenteri-${environment}`
    const calls: Call[] = [
      // SAM Deploy: the artifact bucket, the change set and the transform it names
      ...each(['s3:CreateBucket', 's3:ListBucket'], `arn:aws:s3:::${stack}`),
      ...each(['s3:GetObject', 's3:PutObject'], `arn:aws:s3:::${stack}/${ID}.template`),
      ...each(
        [
          'cloudformation:CreateChangeSet',
          'cloudformation:DescribeChangeSet',
          'cloudformation:DescribeStackEvents',
          'cloudformation:DescribeStacks',
          'cloudformation:ExecuteChangeSet',
          'cloudformation:GetTemplateSummary',
        ],
        regionalArn('cloudformation', `stack/${stack}/${ID}`)
      ),
      ...each(
        ['cloudformation:CreateChangeSet'],
        `arn:aws:cloudformation:${REGION}:aws:transform/Serverless-2016-10-31`
      ),
      // Recovering an update that cannot finish or roll back
      ...each(
        ['cloudformation:CancelUpdateStack', 'cloudformation:ContinueUpdateRollback'],
        regionalArn('cloudformation', `stack/${stack}/${ID}`)
      ),
      // Run data migrations, then smoke and e2e reading the stack
      ...each(['cloudformation:DescribeStackResource'], regionalArn('cloudformation', `stack/${stack}/${ID}`)),
      ...each(['lambda:InvokeFunction'], regionalArn('lambda', `function:${stack}-RunMigrationFunction-${SUFFIX}`)),
      // Deploy to amplify
      ...each(['amplify:GetJob', 'amplify:StartJob'], `${AMPLIFY_APP_ARN}/branches/main/jobs/0000000001`),
    ]

    expect(denied(calls)).toEqual([])
  })

  it('writes the browser tests event into the dev event table and no other stack', () => {
    const table = (environment: Environment) =>
      regionalArn('dynamodb', `table/event-table-v3-koekalenteri-${environment}`)
    const calls = (environment: Environment) => [
      ...each(['dynamodb:DeleteItem', 'dynamodb:PutItem'], table(environment)),
      ...each(['dynamodb:Query'], `${table(environment)}/index/gsiOrganizerStartDate`),
    ]

    expect(denied(calls('dev'))).toEqual([])
    expect(calls('test').filter((call) => allowed(call.action, call.resource))).toEqual([])
    expect(calls('prod').filter((call) => allowed(call.action, call.resource))).toEqual([])
  })

  it.each([
    ['create a role without the boundary', 'iam:CreateRole', `arn:aws:iam::${ACCOUNT}:role/koekalenteri-dev-x`, {}],
    [
      'give a role without the boundary a policy',
      'iam:PutRolePolicy',
      `arn:aws:iam::${ACCOUNT}:role/koekalenteri-dev-x`,
      {},
    ],
    [
      'attach an allowed policy to a role without the boundary',
      'iam:AttachRolePolicy',
      `arn:aws:iam::${ACCOUNT}:role/koekalenteri-dev-x`,
      { 'iam:PolicyARN': LAMBDA_BASIC_EXECUTION },
    ],
    [
      'attach AdministratorAccess',
      'iam:AttachRolePolicy',
      `arn:aws:iam::${ACCOUNT}:role/koekalenteri-dev-x`,
      { ...bounded, 'iam:PolicyARN': 'arn:aws:iam::aws:policy/AdministratorAccess' },
    ],
    ['give itself a policy', 'iam:PutRolePolicy', DEPLOY_ROLE, bounded],
    ['take a policy off itself', 'iam:DetachRolePolicy', DEPLOY_ROLE, bounded],
    ['remove a boundary from itself', 'iam:DeleteRolePermissionsBoundary', DEPLOY_ROLE, {}],
    ['change who may assume it', 'iam:UpdateAssumeRolePolicy', DEPLOY_ROLE, {}],
    ['change the boundary', 'iam:CreatePolicyVersion', BOUNDARY, {}],
    [
      'change its own policies',
      'iam:CreatePolicyVersion',
      `arn:aws:iam::${ACCOUNT}:policy/koekalenteri-github-deploy-iam`,
      {},
    ],
    ['give the admin role a policy', 'iam:PutRolePolicy', `arn:aws:iam::${ACCOUNT}:role/koekalenteri-admin`, bounded],
    ['pass a role of another application', 'iam:PassRole', `arn:aws:iam::${ACCOUNT}:role/koekalenteri-admin`, {}],
    [
      'change its own stack',
      'cloudformation:ExecuteChangeSet',
      regionalArn('cloudformation', `stack/koekalenteri-github-deploy/${ID}`),
      {},
    ],
    [
      'delete a stack',
      'cloudformation:DeleteStack',
      regionalArn('cloudformation', `stack/koekalenteri-prod/${ID}`),
      {},
    ],
    ['write into a bucket of no stack', 's3:PutObject', 'arn:aws:s3:::koekalenteri-main/x', {}],
    ['read a stack bucket object', 's3:GetObject', 'arn:aws:s3:::koekalenteri-prod-event-attachments/x', {}],
  ])('cannot %s', (_, action, resource, context: RequestContext) => {
    expect(allowed(action, resource, context)).toBe(false)
  })

  // The allows above never name these; the Deny keeps it so when a later allow is wider.
  it.each([
    ['itself', DEPLOY_ROLE],
    ['the boundary', BOUNDARY],
    ['its policies', `arn:aws:iam::${ACCOUNT}:policy/koekalenteri-github-deploy-stack`],
  ])('is denied every IAM call on %s', (_, resource) => {
    const allowEverything: PolicyStatement = {
      actions: ['*'],
      conditions: new Map(),
      effect: 'Allow',
      resources: ['*'],
      sid: 'AllowEverything',
    }
    const actions = [
      'iam:AttachRolePolicy',
      'iam:CreatePolicyVersion',
      'iam:DeleteRolePermissionsBoundary',
      'iam:PutRolePolicy',
    ]

    expect(
      actions.filter((action) => isAllowed([...deployStatements, allowEverything], action, resource, bounded))
    ).toEqual([])
  })

  it('decrypts the stack secret through Secrets Manager, and only through it', () => {
    expect(allowed('kms:Decrypt', KEY, through('secretsmanager'))).toBe(true)
    expect(allowed('kms:Decrypt', KEY, through('s3'))).toBe(false)
    expect(allowed('kms:Decrypt', KEY, through('secretsmanager', OTHER_ACCOUNT))).toBe(false)
    expect(allowed('kms:Decrypt', KEY, { 'kms:ViaService': `secretsmanager.${REGION}.amazonaws.com` })).toBe(false)
    expect(allowed('kms:Decrypt', KEY, { 'kms:CallerAccount': ACCOUNT })).toBe(false)
  })

  // A role given a wide policy under the boundary would hold all of it once the boundary is gone.
  it('cannot remove the boundary from a stack role', () => {
    expect(allowed('iam:DeleteRolePermissionsBoundary', `arn:aws:iam::${ACCOUNT}:role/koekalenteri-dev-x`)).toBe(false)
  })

  it('cannot unbound a role it gave a wide policy', () => {
    const role = `arn:aws:iam::${ACCOUNT}:role/koekalenteri-dev-x`
    const steps = [
      ['create it bounded', allowed('iam:CreateRole', role, bounded)],
      ['give it Allow * under the boundary', allowed('iam:PutRolePolicy', role, bounded)],
      ['remove the boundary', allowed('iam:DeleteRolePermissionsBoundary', role, bounded)],
      [
        'swap the boundary for a wider policy',
        allowed('iam:PutRolePermissionsBoundary', role, {
          'iam:PermissionsBoundary': 'arn:aws:iam::aws:policy/AdministratorAccess',
        }),
      ],
    ]

    expect(steps).toEqual([
      ['create it bounded', true],
      ['give it Allow * under the boundary', true],
      ['remove the boundary', false],
      ['swap the boundary for a wider policy', false],
    ])
  })
})

describe('the app template', () => {
  it('names only resource types the deploy role is checked for', () => {
    const unknown = [...new Set(resources.map((resource) => resource.type))].filter((type) => !(type in CALLS))

    expect(unknown).toEqual([])
  })

  it.each(ENVIRONMENTS)('creates, updates and deletes every resource of koekalenteri-%s', (environment) => {
    const stack = new Stack(environment)
    const calls = resources.flatMap((resource) => CALLS[resource.type]?.(resource, stack) ?? [])

    expect(calls.length).toBeGreaterThan(resources.length)
    expect(denied(calls)).toEqual([])
  })

  // Without the boundary the deploy role cannot create the role, so a role without it fails the
  // deploy; with another one its policies are not capped by the deploy role's limit.
  it('sets the boundary on every role, those SAM creates included', () => {
    const roles = resources.filter((resource) => resource.type === 'AWS::IAM::Role')
    const stack = new Stack('dev')
    const boundaries = roles.map((role) => [
      role.id,
      role.properties.PermissionsBoundary === undefined
        ? undefined
        : stack.resolve(role.properties.PermissionsBoundary),
    ])

    expect(roles.length).toBeGreaterThan(resources.filter((r) => r.type === 'AWS::Lambda::Function').length)
    expect(boundaries.filter(([, boundary]) => boundary !== BOUNDARY)).toEqual([])
  })
})

describe('the permissions boundary', () => {
  // A service or resource a role's policy names but the boundary leaves out deploys fine and fails
  // only when the function makes the call.
  it.each(ENVIRONMENTS)('allows everything the policies of koekalenteri-%s give its roles', (environment) => {
    const grants = roleGrants(new Stack(environment))

    expect(grants.length).toBeGreaterThan(resources.filter((r) => r.type === 'AWS::Lambda::Function').length)
    expect(boundaryRefuses(grants)).toEqual([])
  })

  it.each(ENVIRONMENTS)('allows the SSM parameters the functions of koekalenteri-%s read', (environment) => {
    const { calls, shared, stacked } = ssmParameters()
    const parameters = [...shared, ...stacked.map((name) => `koekalenteri-${environment}-${name}`)]
    const refused = parameters.filter(
      (name) => !isAllowed(boundaryStatements, 'ssm:GetParameters', regionalArn('ssm', `parameter/${name}`))
    )

    expect(calls).toBeGreaterThan(0)
    expect(stacked.length).toBeGreaterThan(0)
    expect(refused).toEqual([])
  })

  // secrets.ts reads WithDecryption; a SecureString parameter is decrypted with the role's own
  // credentials through SSM, and the boundary caps that call too.
  it('lets a role decrypt a parameter through SSM, and only through it', () => {
    expect(readFileSync('src/lambda/lib/secrets.ts', 'utf8')).toContain('WithDecryption: true')
    expect(isAllowed(boundaryStatements, 'kms:Decrypt', KEY, through('ssm'))).toBe(true)
    expect(isAllowed(boundaryStatements, 'kms:Decrypt', KEY, through('s3'))).toBe(false)
    expect(isAllowed(boundaryStatements, 'kms:Decrypt', KEY, through('ssm', OTHER_ACCOUNT))).toBe(false)
    expect(isAllowed(boundaryStatements, 'kms:Decrypt', KEY, { 'kms:ViaService': `ssm.${REGION}.amazonaws.com` })).toBe(
      false
    )
    expect(isAllowed(boundaryStatements, 'kms:Decrypt', KEY, { 'kms:CallerAccount': ACCOUNT })).toBe(false)
  })

  it.each([
    ['read a parameter of no stack', 'ssm:GetParameters', regionalArn('ssm', 'parameter/UPSTASH_REDIS_REST_TOKEN')],
    ['read a bucket of no stack', 's3:GetObject', 'arn:aws:s3:::koekalenteri-main/x'],
    ['write a table of no stack', 'dynamodb:PutItem', regionalArn('dynamodb', 'table/event-table')],
    ['write a stack parameter', 'ssm:PutParameter', regionalArn('ssm', 'parameter/koekalenteri-dev-X')],
    ['call IAM', 'iam:CreateRole', `arn:aws:iam::${ACCOUNT}:role/x`],
    ['assume a role', 'sts:AssumeRole', `arn:aws:iam::${ACCOUNT}:role/koekalenteri-admin`],
  ])('keeps a role from doing what no stack does: %s', (_, action, resource) => {
    expect(isAllowed(boundaryStatements, action, resource)).toBe(false)
  })
})
