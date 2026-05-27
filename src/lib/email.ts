import { VALID_TLDS } from './domains/topLevelDomains'

const USEREXP = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+){0,4}$/i
const DOMAINEXP = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.){1,4}[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i

// Guard against URL parser delimiters so the whole value is treated as a domain, not as userinfo, path, query, etc.
const DOMAIN_URL_DELIMITERS = /[/?:#[\]@]/

const domainToASCII = (domain: string) => {
  if (DOMAIN_URL_DELIMITERS.test(domain)) return ''

  try {
    return new URL(`http://${domain}`).hostname
  } catch {
    return ''
  }
}

export const validEmail = (email: string): boolean => {
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

  // check TLD
  const tld = asciiDomain.split('.').pop()
  if (!tld || !VALID_TLDS.includes(tld.toUpperCase())) return false

  return true
}
