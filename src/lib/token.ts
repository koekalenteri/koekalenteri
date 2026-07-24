export const ID_TOKEN_REFRESH_MARGIN_MS = 60_000

interface JwtPayload {
  exp?: unknown
  iat?: unknown
}

const getJwtPayload = (token: string): JwtPayload | undefined => {
  const parts = token.split('.')
  if (parts.length !== 3 || parts.some((part) => !part)) return undefined
  const payload = parts[1]

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))
    const parsed = JSON.parse(decoded) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as JwtPayload) : undefined
  } catch {
    return undefined
  }
}

const tokenFingerprint = (token: string): string => {
  let hash = 0x811c9dc5
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const numericDate = (value: unknown): number | undefined => {
  const milliseconds = typeof value === 'number' ? value * 1000 : Number.NaN
  return Number.isFinite(milliseconds) ? milliseconds : undefined
}

export const getJwtExpiresAt = (token: string): number | undefined => numericDate(getJwtPayload(token)?.exp)

export const isValidIdToken = (token: string, now = Date.now()): boolean => {
  const expiresAt = getJwtExpiresAt(token)
  return expiresAt !== undefined && expiresAt > now
}

interface IdTokenDiagnostics {
  expiresAt?: string
  expiresInMs?: number
  fingerprint: string
  issuedAt?: string
}

/**
 * Identifies a token in diagnostics without exposing any part of the JWT.
 * The fingerprint is only intended for correlating client-side log entries.
 */
export const getIdTokenDiagnostics = (token: string, now = Date.now()): IdTokenDiagnostics => {
  const payload = getJwtPayload(token)
  const expiresAt = numericDate(payload?.exp)
  const issuedAt = numericDate(payload?.iat)

  return {
    ...(expiresAt === undefined
      ? {}
      : {
          expiresAt: new Date(expiresAt).toISOString(),
          expiresInMs: expiresAt - now,
        }),
    fingerprint: tokenFingerprint(token),
    ...(issuedAt === undefined ? {} : { issuedAt: new Date(issuedAt).toISOString() }),
  }
}
