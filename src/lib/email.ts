const USEREXP = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+){0,4}$/i
const DOMAINEXP = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.){1,4}[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

// Guard against URL parser delimiters so the whole value is treated as a domain, not as userinfo, path, query, etc.
const DOMAIN_URL_DELIMITERS = /[/?:#[\]@]/
// What a top-level domain looks like: letters, or an internationalized one in its ASCII form.
const TLDEXP = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i

const domainToASCII = (domain: string) => {
  if (DOMAIN_URL_DELIMITERS.test(domain)) return ''

  try {
    return new URL(`http://${domain}`).hostname
  } catch {
    return ''
  }
}

/**
 * Whether the address is one mail could go to. With the known top-level domains given, the
 * domain's ending must be one of them; without, it only has to look like one — the frontend loads
 * the list on demand (`lib/client/tlds`) and checks against it once it has arrived (KOE-1347).
 */
export const validEmail = (email: string, knownTlds?: ReadonlySet<string>): boolean => {
  const parts = email.split('@')

  if (parts.length !== 2) {
    return false
  }

  const [user, domain] = parts
  if (USEREXP.exec(user) === null) {
    return false
  }

  const asciiDomain = domainToASCII(domain) // allow internationalized domain name
  if (DOMAINEXP.exec(asciiDomain) === null) {
    return false
  }

  const tld = asciiDomain.split('.').pop()
  if (!tld || !TLDEXP.test(tld)) return false
  if (knownTlds && !knownTlds.has(tld.toUpperCase())) return false

  return true
}
