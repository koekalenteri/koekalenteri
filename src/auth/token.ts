import { getAuth0Client } from './auth0Client'

/**
 * Non-React helper for API layer.
 *
 * Note: we intentionally do NOT persist tokens in localStorage; the SDK manages session
 * via Auth0 cookies + in-memory cache.
 */
export async function getAccessToken(): Promise<string | undefined> {
  try {
    const client = await getAuth0Client()
    const token = await client.getTokenSilently()
    return token || undefined
  } catch {
    return
  }
}
