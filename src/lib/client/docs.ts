import type { DocsPage, ReleaseNote } from '../../generated/docs'
import { docsPages, releaseNotes } from '../../generated/docs'

/** The language the pages are written in, and what a reader gets when theirs has none. */
const FALLBACK_LANGUAGE = 'fi'

/**
 * i18next hands out tags like `en-GB`, and the docs are keyed by the plain language, so the tag is
 * narrowed here rather than at every call site.
 */
const forLanguage = <T>(byLanguage: Readonly<Record<string, readonly T[]>>, language: string): readonly T[] =>
  byLanguage[language.split('-')[0]] ?? byLanguage[FALLBACK_LANGUAGE] ?? []

/** The pages for a reader's language. */
export const docsPagesFor = (language: string): readonly DocsPage[] => forLanguage(docsPages, language)

export const docsPageFor = (language: string, path: string): DocsPage | undefined =>
  docsPagesFor(language).find((page) => page.path === path)

/** The release notes for a reader's language, newest first. */
export const releaseNotesFor = (language: string): readonly ReleaseNote[] => forLanguage(releaseNotes, language)
