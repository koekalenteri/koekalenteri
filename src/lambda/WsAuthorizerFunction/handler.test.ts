import { generateKeyPairSync, sign } from 'node:crypto'
import { jest } from '@jest/globals'

const mockVerify = jest.fn<(...args: any[]) => Promise<any>>()

jest.unstable_mockModule('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: mockVerify })),
  },
}))

const { default: handler } = await import('./handler')

const b64 = (v: string) => Buffer.from(v).toString('base64url')

describe('WsAuthorizerFunction', () => {
  const oldEnv = process.env.COGNITO_APP_CLIENT_ID
  const oldUserPoolId = process.env.COGNITO_USER_POOL_ID

  beforeEach(() => {
    process.env.COGNITO_APP_CLIENT_ID = 'app-client-id'
    process.env.COGNITO_USER_POOL_ID = 'eu-west-1_pool'
    mockVerify.mockReset()
  })

  afterEach(() => {
    process.env.COGNITO_APP_CLIENT_ID = oldEnv
    process.env.COGNITO_USER_POOL_ID = oldUserPoolId
    jest.restoreAllMocks()
  })

  it('denies when token is missing', async () => {
    const res = await handler({ routeArn: 'arn:test' })
    expect(res.policyDocument.Statement[0].Effect).toBe('Deny')
  })

  it('allows valid id token from query token', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const pub = publicKey.export({ format: 'jwk' }) as JsonWebKey
    const header = { alg: 'RS256', kid: 'kid-1', typ: 'JWT' }
    const payload = {
      aud: 'app-client-id',
      email: 'test@example.com',
      exp: Math.floor(Date.now() / 1000) + 300,
      iss: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_pool',
      sub: 'sub-123',
      token_use: 'id',
    }
    const input = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`
    const signature = sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')
    const token = `${input}.${signature}`

    mockVerify.mockResolvedValue(payload)

    const res = await handler({ queryStringParameters: { token }, routeArn: 'arn:test' })

    expect(res.policyDocument.Statement[0].Effect).toBe('Allow')
    expect(res.principalId).toBe('sub-123')
  })
})
