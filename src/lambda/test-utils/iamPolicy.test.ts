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

describe('policyStatements', () => {
  it.each([
    ['an unknown operator', { Action: 'a', Condition: { Bool: { k: 'true' } }, Effect: 'Allow', Resource: '*' }],
    ['NotAction', { Effect: 'Allow', NotAction: 'a', Resource: '*' }],
    ['an Effect of neither kind', { Action: 'a', Effect: 'Maybe', Resource: '*' }],
    ['an action that is not a string', { Action: [1], Effect: 'Allow', Resource: '*' }],
  ])('throws on %s', (_, statement) => {
    expect(() => policyStatements({ Statement: [statement] }, 'test')).toThrow()
  })
})
