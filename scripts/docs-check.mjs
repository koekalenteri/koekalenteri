#!/usr/bin/env node

/**
 * Everything a guide can get wrong that a reader would otherwise be the first to notice.
 *
 * Errors fail the run (pre-commit and the CI `docs` job): a page that does not bind -- an unknown
 * `{t:key}`, a `!shot` with no reference picture, a translation out of step with its original --
 * a generated module that is not what the sources say, a link to a page that does not exist, and
 * a picture written as a markdown image instead of a `!shot`. Warnings only print: `TODO` marks a
 * guide's author left for a person to settle, and the application's pages that no guide covers.
 *
 * `--online` also fetches every external link; off by default, because the network is not part
 * of a commit.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  linksIn,
  loadPages,
  OUT_FILE,
  pageCovers,
  relativeLinkTarget,
  render,
  SOURCE_LANGUAGE,
  translationProblems,
} from './lib/docs.mjs'

const online = process.argv.includes('--online')

const errors = []
const warnings = []

let loaded
try {
  loaded = await loadPages()
} catch (error) {
  console.error(`❌ ${error.message}`)
  process.exit(1)
}
const { byLanguage, pages } = loaded

errors.push(...translationProblems(byLanguage))

// ---- the generated module ---------------------------------------------------------------------

if (!existsSync(OUT_FILE) || readFileSync(OUT_FILE, 'utf8') !== render(byLanguage)) {
  errors.push(`${OUT_FILE} is out of date. Run \`npm run build-docs\` and commit the result.`)
}

// ---- links ------------------------------------------------------------------------------------

const external = []
for (const page of pages) {
  for (const { image, line, target } of linksIn(page)) {
    const at = `${page.file}:${line}`
    if (image) {
      errors.push(`${at}: a guide's picture is a visual test's reference, \`!shot[Test/name]\`, not a markdown image`)
      continue
    }
    if (target.startsWith('#') || target.startsWith('mailto:')) continue
    if (/^https?:\/\//.test(target)) {
      external.push({ at, target })
      continue
    }
    const guide = /^\/ohjeet\/([^#?]+)/.exec(target)
    if (guide) {
      if (!byLanguage[page.language]?.some((candidate) => candidate.path === guide[1])) {
        errors.push(`${at}: links to /ohjeet/${guide[1]}, and no ${page.language} page has that path`)
      }
      continue
    }
    if (target.endsWith('.md') || target.includes('.md#')) {
      const file = relativeLinkTarget(page, target)
      if (!existsSync(file)) errors.push(`${at}: links to ${relative('.', file)}, which does not exist`)
      else warnings.push(`${at}: links to a markdown file; a reader follows /ohjeet/<path> links, not files`)
    }
  }
}

if (online) {
  for (const { at, target } of external) {
    try {
      const response = await fetch(target, { method: 'HEAD', redirect: 'follow' })
      if (!response.ok) errors.push(`${at}: ${target} answered ${response.status}`)
    } catch (error) {
      errors.push(`${at}: ${target} could not be fetched (${error.message})`)
    }
  }
}

// ---- marks left for a person ------------------------------------------------------------------

for (const page of pages) {
  page.body.split('\n').forEach((text, index) => {
    if (/\bTODO\b/.test(text)) {
      warnings.push(`${page.file}:${page.frontmatterLines + index + 1}: TODO left for a person to settle`)
    }
  })
}

// ---- what no guide covers ---------------------------------------------------------------------

/** The application's pages a guide would not describe: infrastructure, not a task of anyone's. */
const PAGES_WITHOUT_A_GUIDE = new Set([
  'src/pages/DocsIndexPage.tsx',
  'src/pages/DocsPage.tsx',
  'src/pages/ErrorPage.tsx',
  'src/pages/HomePage.tsx',
  'src/pages/LoadingPage.tsx',
  'src/pages/LoginPage.tsx',
  'src/pages/TermsPage.tsx',
])

const pageComponents = (dir = 'src/pages', found = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) pageComponents(full, found)
    else if (/Page\.tsx$/.test(entry) && !PAGES_WITHOUT_A_GUIDE.has(full)) found.push(full)
  }

  return found
}

const sourcePages = byLanguage[SOURCE_LANGUAGE] ?? []
const uncovered = pageComponents().filter((file) => !sourcePages.some((page) => pageCovers(page, file)))
if (uncovered.length) {
  warnings.push(`no guide covers these pages:\n     ${uncovered.join('\n     ')}`)
}

// ---- verdict ----------------------------------------------------------------------------------

for (const warning of warnings) console.warn(`⚠️  ${warning}`)
for (const error of errors) console.error(`❌ ${error}`)

if (errors.length) {
  process.exit(1)
}
console.log(`✅ ${pages.length} guide pages bind, link and match ${OUT_FILE}`)
