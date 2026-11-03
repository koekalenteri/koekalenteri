/**
 * `{t:key}` in the guide's and the release notes' text names a `translation.json` entry, so a
 * renamed button renames itself in the text. Shared by the docs build and the release description,
 * and kept free of dependencies so the release workflow can run it without an install.
 */

import { existsSync, readFileSync } from 'node:fs'

const translationCache = new Map()

/** `translation.json` of a language as `dotted.key` -> string. */
const translations = (language) => {
  if (!translationCache.has(language)) {
    const file = `src/i18n/locales/${language}/translation.json`
    if (!existsSync(file)) throw new Error(`no translations for language "${language}" (${file})`)
    const flat = new Map()
    const walk = (node, prefix) => {
      for (const [key, value] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (value && typeof value === 'object') walk(value, path)
        else flat.set(path, value)
      }
    }
    walk(JSON.parse(readFileSync(file, 'utf8')), '')
    translationCache.set(language, flat)
  }

  return translationCache.get(language)
}

/** `{t:registration.cta.fetch}` in a page's text. */
const TRANSLATION_REF = /\{t:([\w.-]+)\}/g

/** Markdown would read a value's `*`, `_`, backtick or bracket as syntax; the label is plain text. */
const escapeMarkdown = (text) => text.replace(/([\\`*_[\]<>])/g, '\\$1')

/**
 * The text with every `{t:key}` replaced by the language's own string. An unknown key, or one
 * that needs interpolation, is an error: the guide names a control, and the control's name is
 * whatever `translation.json` says it is, nothing the guide wrote itself.
 */
export const resolveTranslations = (text, language, file, { markdown = true } = {}) => {
  const strings = translations(language)

  return text.replace(TRANSLATION_REF, (_, key) => {
    const value = strings.get(key)
    if (typeof value !== 'string') {
      throw new Error(`${file}: no translation "${key}" in src/i18n/locales/${language}/translation.json`)
    }
    if (value.includes('{{')) {
      throw new Error(`${file}: translation "${key}" needs interpolation and cannot name a control as is`)
    }

    return markdown ? escapeMarkdown(value) : value
  })
}
