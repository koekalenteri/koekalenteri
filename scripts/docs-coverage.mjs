#!/usr/bin/env node

/**
 * Which guide pages a change touches, from the pages' `covers`.
 *
 * A hint, not a gate: pre-commit runs it on the staged files so the author hears "this change
 * concerns the pages X and Y" while the change is fresh, and can update the guide at once if it
 * is worth it. The guides' proper update is a release-time task (`npm run docs-update`); this
 * never fails a commit.
 *
 * Usage: docs-coverage.mjs --staged | --since <ref> | <file...>
 */

import { execFileSync } from 'node:child_process'
import { loadPages, pagesCovering } from './lib/docs.mjs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)

/** The files a change names, from whichever of the three ways the caller described it. */
const changedFiles = (args) => {
  if (args.includes('--staged')) return git('diff', '--cached', '--name-only', '--diff-filter=ACMRD')
  const since = args.indexOf('--since')
  if (since >= 0) {
    const ref = args[since + 1]
    if (!ref) throw new Error('--since needs a ref')
    return git('diff', '--name-only', `${ref}..HEAD`)
  }

  return args.filter((arg) => !arg.startsWith('--'))
}

const args = process.argv.slice(2)
const files = changedFiles(args)
const code = files.filter((file) => file.startsWith('src/'))

if (code.length === 0) {
  console.log('docs-coverage: no application code in this change')
  process.exit(0)
}

const { pages } = await loadPages()
const touched = pagesCovering(pages, code)

if (touched.length === 0) {
  console.log(`docs-coverage: no guide page covers the changed code (${code.length} files)`)
} else {
  console.log(`docs-coverage: this change concerns ${touched.length} guide page(s):`)
  for (const page of touched) {
    const hits = code.filter((file) => pagesCovering([page], [file]).length)
    console.log(`  ${page.file} — ${page.title} (${hits.slice(0, 3).join(', ')}${hits.length > 3 ? ', …' : ''})`)
  }
}
