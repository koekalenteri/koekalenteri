import { isGranted } from './dynamoActions'
import { templateTables } from './templateGrants'

const template = (policies: string) => `
Globals:
  Function:
    Environment:
      Variables:
        USER_TABLE_NAME: !Ref UserTable
        STAGE_NAME: !Ref StageNameParam
Resources:
  UserTable:
    Type: AWS::DynamoDB::Table
  AuditTable:
    Type: AWS::DynamoDB::Table
  AuthorizePolicy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Action:
              - dynamodb:GetItem
            Resource: !GetAtt UserTable.Arn
          - Effect: Allow
            Action: dynamodb:Query
            Resource: !Sub \${UserTable.Arn}/index/gsiEmail
  OneFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambda/OneFunction
      Policies:
${policies}
`

const grantsOf = (policies: string) => {
  const { functions } = templateTables(template(policies))
  const one = functions.get('OneFunction')
  if (!one) throw new Error('no function')
  return one.grants
}

describe('templateTables', () => {
  it('maps the table variables of the Globals to their tables', () => {
    const { environmentVariables } = templateTables(template('        - CloudWatchPutMetricPolicy: {}'))

    expect([...environmentVariables]).toEqual([['USER_TABLE_NAME', 'UserTable']])
  })

  it('reads a managed policy down to its index resources', () => {
    const grants = grantsOf('        - !Ref AuthorizePolicy')

    expect(isGranted(grants, 'UserTable', 'GetItem')).toBe(true)
    expect(isGranted(grants, 'UserTable/index/gsiEmail', 'Query')).toBe(true)
    // An index resource allows nothing on the table itself, and nothing on another index.
    expect(isGranted(grants, 'UserTable', 'Query')).toBe(false)
    expect(isGranted(grants, 'UserTable/index/gsiName', 'Query')).toBe(false)
  })

  it('reads an inline policy document with a Version beside its statements', () => {
    const grants = grantsOf(`        - Version: "2012-10-17"
          Statement:
            - Effect: Allow
              Action: dynamodb:DeleteItem
              Resource: !Sub \${AuditTable.Arn}/index/*`)

    expect(isGranted(grants, 'AuditTable/index/anything', 'DeleteItem')).toBe(true)
    expect(isGranted(grants, 'AuditTable', 'DeleteItem')).toBe(false)
  })

  it('grants what the SAM policy templates grant, on the table and its indexes', () => {
    const grants = grantsOf(`        - DynamoDBWritePolicy:
            TableName: !Ref AuditTable
        - DynamoDBReadPolicy:
            TableName: !Ref UserTable`)

    expect(isGranted(grants, 'AuditTable', 'PutItem')).toBe(true)
    expect(isGranted(grants, 'AuditTable', 'DeleteItem')).toBe(false)
    expect(isGranted(grants, 'AuditTable', 'ConditionCheckItem')).toBe(false)
    expect(isGranted(grants, 'UserTable/index/gsiEmail', 'Query')).toBe(true)
    expect(isGranted(grants, 'UserTable', 'PutItem')).toBe(false)
  })

  it.each([
    [
      'a DynamoDB policy template it does not know',
      '        - DynamoDBStreamReadPolicy:\n            TableName: !Ref AuditTable',
      /DynamoDBStreamReadPolicy/,
    ],
    ['a policy that is not a SAM template', '        - Foo: bar', /Foo is not a policy/],
    [
      'a statement over every resource',
      '        - Statement:\n            - Effect: Allow\n              Action: dynamodb:GetItem\n              Resource: "*"',
      /not a table ARN/,
    ],
    [
      'a template naming no table',
      '        - DynamoDBReadPolicy:\n            TableName: !Ref StageNameParam',
      /names no table/,
    ],
    [
      'an action it does not classify',
      '        - Statement:\n            - Effect: Allow\n              Action: dynamodb:PartiQLSelect\n              Resource: !GetAtt UserTable.Arn',
      /dynamodb:PartiQLSelect is not classified/,
    ],
    [
      'a statement that is not Allow',
      '        - Statement:\n            - Effect: Deny\n              Action: dynamodb:GetItem\n              Resource: !GetAtt UserTable.Arn',
      /not Allow/,
    ],
    [
      'a resource that is not a table',
      '        - Statement:\n            - Effect: Allow\n              Action: dynamodb:GetItem\n              Resource: !GetAtt AuthorizePolicy.Arn',
      /AuthorizePolicy is not a table/,
    ],
    [
      'a Ref to something that is not a managed policy',
      '        - !Ref UserTable',
      /UserTable is not a managed policy/,
    ],
    ['a policy that is not a map', '        - CloudWatchPutMetricPolicy', /not a map/],
  ])('refuses %s', (_, policies, message) => {
    expect(() => grantsOf(policies)).toThrow(message)
  })
})
