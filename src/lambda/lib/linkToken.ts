import type { APIGatewayProxyEvent } from 'aws-lambda'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * The tokens behind the links handed to people who have no account: a post's live entry (KOE-1258),
 * a class secretary's number draw (KOE-1267). All of them are one HMAC over a domain-prefixed
 * message, mirroring `deriveRegistrationEditToken`, and all of them share that secret on purpose —
 * the prefix is what keeps the token families apart, and one secret means no second piece of
 * infrastructure to rotate.
 */
export const deriveLinkToken = (message: string, secret: string): string =>
  createHmac('sha256', secret).update(message).digest('base64url')

/** Links issued before their version field existed are version 1 implicitly, as registration links are. */
export const DEFAULT_LINK_TOKEN_VERSION = 1

export const getBearerToken = (event: Pick<APIGatewayProxyEvent, 'headers'>): string => {
  const authorization = event.headers.Authorization ?? event.headers.authorization ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(authorization)
  return match?.[1] ?? ''
}

export const linkTokensMatch = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}
