#!/usr/bin/env node

/**
 * The description of a GitHub release, from the English release notes the version shipped with:
 * `docs/en/whats-new/<version>.md` without its frontmatter and with every `{t:key}` resolved from
 * the English translations. The release workflow writes it over the description typed into the
 * form (KOE-1398); the form cannot fill it in by itself.
 *
 * A pre-release tag (`v2.1.0-beta.1`) describes itself with the version's notes, `2.1.0.md`.
 *
 * Usage: release-description.mjs v2.1.0 > release-notes.md
 * Exit:  0 with the description on stdout; 3 when the version has no notes
 */

import { existsSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolveTranslations } from './lib/translations.mjs'

export const LANGUAGE = 'en'
export const NO_NOTES = 3

/** `v2.1.0-beta.1` -> `docs/en/whats-new/2.1.0.md`. */
export const notesFileFor = (tag) => {
  const version = tag.replace(/^v/, '').replace(/-.*$/, '')
  return `docs/${LANGUAGE}/whats-new/${version}.md`
}

/** The notes' body with the frontmatter dropped and the controls named as the application names them. */
export const releaseDescription = (source, file) => {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(source)
  if (!match) throw new Error(`${file}: no frontmatter`)

  return `${resolveTranslations(source.slice(match[0].length), LANGUAGE, file).trim()}\n`
}

const main = () => {
  const tag = process.argv[2]
  if (!tag) {
    console.error('usage: release-description.mjs <tag>')
    process.exit(1)
  }
  const file = notesFileFor(tag)
  if (!existsSync(file)) {
    console.error(`no release notes at ${file}`)
    process.exit(NO_NOTES)
  }
  process.stdout.write(releaseDescription(readFileSync(file, 'utf8'), file))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
