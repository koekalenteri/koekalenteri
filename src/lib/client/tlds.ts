/**
 * The known top-level domains, loaded on demand. The list is fifteen hundred lines that only an
 * address check needs, so it stays out of the eager bundle and is fetched once a form that checks
 * addresses is on screen (KOE-1347). Until it has arrived the check accepts any ending that looks
 * like one.
 */
let known: ReadonlySet<string> | undefined
let loading: Promise<ReadonlySet<string>> | undefined

export const loadKnownTlds = (): Promise<ReadonlySet<string>> => {
  loading ??= import('../domains/topLevelDomains').then((module) => {
    known = module.KNOWN_TLDS
    return known
  })
  return loading
}

/** The list once it has loaded, and nothing before. */
export const knownTlds = (): ReadonlySet<string> | undefined => known
