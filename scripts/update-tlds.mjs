#!/usr/bin/env node

/**
 * Rewrites `src/lib/domains/topLevelDomains.ts` from IANA's list of top-level domains. The address
 * check refuses an ending the list does not have, so a list left behind turns away real addresses
 * and keeps accepting endings that no longer exist (KOE-1689).
 *
 * Run it now and then and commit the result. A failed fetch or a body that is not the list stops
 * the run before the file is touched, and a list that has not changed leaves the file as it is.
 *
 * Usage: update-tlds.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const TLD_LIST_URL = 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt'
export const TLD_MODULE = path.join(import.meta.dirname, '..', 'src/lib/domains/topLevelDomains.ts')

const REQUEST_TIMEOUT_MS = 15_000
const HEADER = /^# Version \d+, Last Updated [^\n]+ UTC$/
const TLD = /^(?:[A-Z]{2,63}|XN--[A-Z0-9-]{1,59})$/
// The root zone has held well over a thousand endings since 2015. A body far below that is a
// truncated answer, and writing it would turn away every address on the endings it lost.
const MIN_TLDS = 1000

/** IANA's file as its version line and its endings, in the file's order. Throws on anything else. */
export const parseTldList = (body) => {
  const [header, ...tlds] = body.split('\n').filter((line) => line !== '')
  if (!HEADER.test(header ?? '')) throw new Error(`the first line is not IANA's version line: ${header}`)

  const invalid = tlds.find((tld) => !TLD.test(tld))
  if (invalid !== undefined) throw new Error(`not a top-level domain: ${invalid}`)
  if (tlds.length < MIN_TLDS) throw new Error(`only ${tlds.length} top-level domains, expected at least ${MIN_TLDS}`)

  return { header, tlds }
}

/** The module's text, formatted as Biome would, so that the same list always gives the same bytes. */
export const renderTldModule = ({ header, tlds }) =>
  [
    '/**',
    ` * ${TLD_LIST_URL}`,
    ' *',
    ` * ${header}`,
    ' *',
    ' * Written by `npm run update-tlds`, not by hand.',
    ' */',
    'const VALID_TLDS = [',
    ...tlds.map((tld) => `  '${tld}',`),
    ']',
    '',
    "/** The same list as a set, for the address check to look a domain's ending up in. */",
    'export const KNOWN_TLDS: ReadonlySet<string> = new Set(VALID_TLDS)',
    '',
  ].join('\n')

/** Fetches the list and writes the module. Answers what it found and whether the file changed. */
export const updateTlds = async ({ fetch = globalThis.fetch, file = TLD_MODULE } = {}) => {
  const response = await fetch(TLD_LIST_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (response.status !== 200) throw new Error(`${TLD_LIST_URL} answered ${response.status}`)

  const list = parseTldList(await response.text())
  const text = renderTldModule(list)
  const changed = text !== readFileSync(file, 'utf8')
  if (changed) writeFileSync(file, text)

  return { changed, count: list.tlds.length, header: list.header }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  updateTlds()
    .then(({ changed, count, header }) => {
      console.log(`${count} top-level domains, ${header}`)
      console.log(changed ? 'topLevelDomains.ts rewritten' : 'topLevelDomains.ts already up to date')
    })
    .catch((error) => {
      console.error(`update-tlds: ${error.message}`)
      process.exit(1)
    })
}
