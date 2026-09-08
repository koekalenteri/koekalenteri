#!/usr/bin/env node

/**
 * Turns the markdown under `docs/` into one generated module the frontend imports.
 *
 * The conversion happens here rather than in the browser for two reasons: the remark chain is
 * already a dependency (the lambda renders email markdown with it), so this costs the client
 * nothing, and Amplify's rewrite rule sends everything without a known extension to index.html --
 * a `.md` fetched at runtime would silently return the application's HTML instead.
 *
 * Checking that the committed module is current, along with the guides' links and coverage, is
 * `scripts/docs-check.mjs`; the bindings themselves live in `scripts/lib/docs.mjs`.
 */

import { writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { checkTranslations, loadPages, OUT_FILE, render } from './lib/docs.mjs'

const { byLanguage } = await loadPages()
checkTranslations(byLanguage)

await mkdir(dirname(OUT_FILE), { recursive: true })
writeFileSync(OUT_FILE, render(byLanguage))

const count = Object.values(byLanguage).reduce((sum, pages) => sum + pages.length, 0)
console.log(`✅ ${count} pages in ${Object.keys(byLanguage).length} languages into ${OUT_FILE}`)
