import { createRemoteJWKSet, jwtVerify } from 'jose'

/**
 * Verify an RS256 JWT against an OIDC issuer.
 *
 * Intended for SAM Local / local runs where API Gateway authorizers don't execute.
 */
export async function verifyOidcJwt(opts: {
  token: string
  issuer: string
  audience: string
}): Promise<Record<string, any>> {
  const { token } = opts

  const issuer = normalizeIssuer(opts.issuer)
  const jwksUrl = new URL('.well-known/jwks.json', issuer)

  const jwks = createRemoteJWKSet(jwksUrl)
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: opts.audience,
  })

  return payload as any
}

export function normalizeIssuer(issuer: string): string {
  // Auth0 issuer must include trailing slash. Enforce it to avoid subtle mismatches.
  const trimmed = String(issuer ?? '').trim()
  if (!trimmed) return trimmed
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

export function getBearerTokenFromHeaders(headers?: Record<string, string | undefined>) {
  const raw = headers?.authorization ?? headers?.Authorization
  if (!raw) return

  const m = /^Bearer\s+(.+)$/.exec(raw)
  return m?.[1]
}
