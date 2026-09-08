import type { DocsPage } from '../../generated/docs'
import { docsPages } from '../../generated/docs'

/** The language the pages are written in, and what a reader gets when theirs has none. */
const FALLBACK_LANGUAGE = 'fi'

/**
 * The pages for a reader's language. i18next hands out tags like `en-GB`, and the docs are keyed by
 * the plain language, so the tag is narrowed here rather than at every call site.
 */
export const docsPagesFor = (language: string): readonly DocsPage[] =>
  docsPages[language.split('-')[0]] ?? docsPages[FALLBACK_LANGUAGE] ?? []

export const docsPageFor = (language: string, path: string): DocsPage | undefined =>
  docsPagesFor(language).find((page) => page.path === path)
