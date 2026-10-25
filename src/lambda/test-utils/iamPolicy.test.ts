import { isAllowed, policyStatements, wildcardMatches } from './iamPolicy'

const statements = policyStatements(
  {
    Statement: [
      { Action: ['s3:Get*', 'S3:ListBucket'], Effect: 'Allow', Resource: 'arn:aws:s3:::bucket-?/*' },
      {
        Action: 'iam:CreateRole',
        Condition: { StringEquals: { 'iam:PermissionsBoundary': 'boundary' } },
        Effect: 'Allow',
        Resource: '*',
      },
      {
        Action: 'iam:AttachRolePolicy',
        Condition: { ArnLike: { 'iam:PolicyARN': ['arn:aws:iam::aws:policy/service-role/*'] } },
        Effect: 'Allow',
        Resource: '*',
      },
      { Action: 's3:GetObject', Effect: 'Deny', Resource: 'arn:aws:s3:::bucket-b/secret' },
    ],
  },
  'test'
)

describe('wildcardMatches', () => {
  it.each([
    ['a*', 'abc', true],
    ['a?c', 'abc', true],
    ['a?c', 'abbc', false],
    ['a.c', 'abc', false],
    ['arn:aws:s3:::x/*', 'arn:aws:s3:::x/y/z', true],
  ])('%s matches %s: %s', (pattern, value, expected) => {
    expect(wildcardMatches(pattern, value)).toBe(expected)
  })

  it('ignores case only when asked', () => {
    expect(wildcardMatches('s3:GetObject', 'S3:GETOBJECT')).toBe(false)
    expect(wildcardMatches('s3:GetObject', 'S3:GETOBJECT', true)).toBe(true)
  })
})

describe('isAllowed', () => {
  it('allows what an Allow matches, whatever the case of the action', () => {
    expect(isAllowed(statements, 's3:GetObject', 'arn:aws:s3:::bucket-a/key')).toBe(true)
    expect(isAllowed(statements, 's3:listbucket', 'arn:aws:s3:::bucket-a/key')).toBe(true)
  })

  it('denies what no Allow matches', () => {
    expect(isAllowed(statements, 's3:PutObject', 'arn:aws:s3:::bucket-a/key')).toBe(false)
    expect(isAllowed(statements, 's3:GetObject', 'arn:aws:s3:::bucket-ab/key')).toBe(false)
  })

  it('lets an explicit Deny win', () => {
    expect(isAllowed(statements, 's3:GetObject', 'arn:aws:s3:::bucket-b/secret')).toBe(false)
  })

  it('needs every condition key in the request', () => {
    expect(isAllowed(statements, 'iam:CreateRole', 'role')).toBe(false)
    expect(isAllowed(statements, 'iam:CreateRole', 'role', { 'iam:PermissionsBoundary': 'other' })).toBe(false)
    expect(isAllowed(statements, 'iam:CreateRole', 'role', { 'iam:PermissionsBoundary': 'boundary' })).toBe(true)
  })

  it('matches a Like condition with wildcards', () => {
    const policy = (arn: string) => ({ 'iam:PolicyARN': arn })

    expect(
      isAllowed(statements, 'iam:AttachRolePolicy', 'role', policy('arn:aws:iam::aws:policy/service-role/X'))
    ).toBe(true)
    expect(isAllowed(statements, 'iam:AttachRolePolicy', 'role', policy('arn:aws:iam::aws:policy/X'))).toBe(false)
  })
})

describe('isAllowed with conditions and overlapping statements', () => {
  const conditional = policyStatements(
    {
      Statement: [
        {
          Action: 'iam:PassRole',
          Condition: { ArnEquals: { 'iam:AssociatedResourceArn': 'arn:aws:lambda:*:*:function:app-*' } },
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: 'sts:TagSession',
          Condition: { StringLike: { 'aws:RequestTag/team': 'app-*' } },
          Effect: 'Allow',
          Resource: '*',
        },
        { Action: 's3:*', Effect: 'Allow', Resource: 'arn:aws:s3:::bucket/*' },
        {
          Action: 's3:DeleteObject',
          Condition: { StringEquals: { 'aws:PrincipalTag/role': 'reader' } },
          Effect: 'Deny',
          Resource: 'arn:aws:s3:::bucket/*',
        },
        { Action: 's3:PutObject', Effect: 'Deny', Resource: 'arn:aws:s3:::bucket/locked/*' },
      ],
    },
    'conditional'
  )

  it('matches ArnEquals with wildcards, as IAM does', () => {
    const context = (arn: string) => ({ 'iam:AssociatedResourceArn': arn })

    expect(isAllowed(conditional, 'iam:PassRole', 'role', context('arn:aws:lambda:eu-north-1:1:function:app-x'))).toBe(
      true
    )
    expect(isAllowed(conditional, 'iam:PassRole', 'role', context('arn:aws:lambda:eu-north-1:1:function:other'))).toBe(
      false
    )
  })

  it('matches StringLike with wildcards', () => {
    expect(isAllowed(conditional, 'sts:TagSession', '*', { 'aws:RequestTag/team': 'app-one' })).toBe(true)
    expect(isAllowed(conditional, 'sts:TagSession', '*', { 'aws:RequestTag/team': 'web-one' })).toBe(false)
  })

  it('applies a Deny only when its condition holds', () => {
    expect(isAllowed(conditional, 's3:DeleteObject', 'arn:aws:s3:::bucket/key')).toBe(true)
    expect(
      isAllowed(conditional, 's3:DeleteObject', 'arn:aws:s3:::bucket/key', { 'aws:PrincipalTag/role': 'reader' })
    ).toBe(false)
  })

  it('lets the Deny win where an Allow and a Deny match the same call', () => {
    expect(isAllowed(conditional, 's3:PutObject', 'arn:aws:s3:::bucket/open/key')).toBe(true)
    expect(isAllowed(conditional, 's3:PutObject', 'arn:aws:s3:::bucket/locked/key')).toBe(false)
  })
})

describe('policyStatements', () => {
  it.each([
    ['an unknown operator', { Action: 'a', Condition: { Bool: { k: 'true' } }, Effect: 'Allow', Resource: '*' }],
    ['NotAction', { Effect: 'Allow', NotAction: 'a', Resource: '*' }],
    ['NotResource', { Action: 'a', Effect: 'Allow', NotResource: 'x' }],
    ['an Effect of neither kind', { Action: 'a', Effect: 'Maybe', Resource: '*' }],
    ['an action that is not a string', { Action: [1], Effect: 'Allow', Resource: '*' }],
  ])('throws on %s', (_, statement) => {
    expect(() => policyStatements({ Statement: [statement] }, 'test')).toThrow()
  })
})
