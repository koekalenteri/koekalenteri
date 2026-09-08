/**
 * What the guide scripts share: reading the markdown under `docs/`, binding it to the code it
 * describes, and rendering the module the frontend imports.
 *
 * A guide page is bound to the application three ways, and every binding fails the build rather
 * than a reader: `{t:key}` names a `translation.json` entry, so a renamed button renames itself in
 * the guide and a removed one breaks it; `!shot[Test/name]` names a visual test's reference
 * picture, so a changed component fails its test until the picture is looked at; and `covers`
 * names the code the page describes, so a changed file tells which pages are going stale.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const DOCS_DIR = 'docs'
export const OUT_FILE = 'src/generated/docs/index.ts'
/** The language every other language is translated from. */
export const SOURCE_LANGUAGE = 'fi'
const AUDIENCES = ['participant', 'secretary', 'admin']

const collectMarkdown = (dir, found) => {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectMarkdown(full, found)
    else if (full.endsWith('.md')) found.push(full)
  }

  return found
}

/** A language directory holds pages; anything else under `docs/` (AGENTS.md) is for the writers. */
const LANGUAGE_DIR = /^[a-z]{2}$/

/** Every page file, `docs/<language>/**\/*.md`. */
const markdownFiles = (dir = DOCS_DIR) => {
  const found = []
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (LANGUAGE_DIR.test(entry) && statSync(full).isDirectory()) collectMarkdown(full, found)
  }

  return found
}

/**
 * The frontmatter subset the docs actually use: scalars, block lists and inline lists. A YAML
 * parser is a dependency this does not need for six keys.
 */
const parseFrontmatter = (source, file) => {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source)
  if (!match) throw new Error(`${file}: no frontmatter`)

  const data = {}
  let listKey
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue

    const item = /^\s+-\s+(.*)$/.exec(line)
    if (item && listKey) {
      data[listKey].push(item[1].trim())
      continue
    }

    const pair = /^([\w]+):\s*(.*)$/.exec(line)
    if (!pair) throw new Error(`${file}: cannot read frontmatter line "${line}"`)

    const [, key, rawValue] = pair
    const value = rawValue.trim()
    if (value === '') {
      listKey = key
      data[key] = []
    } else if (value.startsWith('[')) {
      listKey = undefined
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    } else {
      listKey = undefined
      data[key] = value
    }
  }

  return { body: source.slice(match[0].length), data, frontmatterLines: match[0].split('\n').length - 1 }
}

/** `docs/fi/koesihteerille/ilmoaikana.md` -> language `fi`, path `koesihteerille/ilmoaikana`. */
const pageIdentity = (file) => {
  const [, language, ...rest] = relative('.', file).split('/')

  return { language, path: rest.join('/').replace(/\.md$/, '') }
}

/** Short digest of a translation's source, so a changed original shows up as a stale translation. */
export const digest = (body) => createHash('sha256').update(body.trim()).digest('hex').slice(0, 6)

// ---- translation keys -------------------------------------------------------------------------

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
const resolveTranslations = (text, language, file, { markdown = true } = {}) => {
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

// ---- screenshots ------------------------------------------------------------------------------

const SCREENSHOTS_SEGMENT = '__screenshots__'
const SHOT_SUFFIX = '-chromium-linux.png'

/**
 * Every reference screenshot the visual tests keep, as `TestName/shot-name` -> file. A guide's
 * picture is one of these and nothing else: it was rendered from the same component and mock data
 * as the test, CI compares it on every push, and a change to the component fails the build until
 * somebody looks at the new picture. The linux file is the one CI verifies, so it is the one shown.
 */
const indexScreenshots = (dir = 'src', found = new Map()) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (!statSync(full).isDirectory()) continue
    if (entry === SCREENSHOTS_SEGMENT) {
      for (const testDir of readdirSync(full)) {
        const testName = testDir.replace(/\.visual\.test\.tsx$/, '')
        for (const png of readdirSync(join(full, testDir))) {
          if (png.endsWith(SHOT_SUFFIX)) {
            found.set(`${testName}/${png.slice(0, -SHOT_SUFFIX.length)}`, join(full, testDir, png))
          }
        }
      }
    } else if (entry !== 'node_modules') {
      indexScreenshots(full, found)
    }
  }

  return found
}

/** A shot with a language variant (`name-en`) shows that; the others show the Finnish reference. */
const resolveShot = (ref, language, file, screenshots) => {
  const found = screenshots.get(`${ref}-${language}`) ?? screenshots.get(ref)
  if (!found) {
    const known = [...screenshots.keys()].filter((key) => key.startsWith(`${ref.split('/')[0]}/`))
    throw new Error(
      `${file}: no screenshot "${ref}". A guide's picture is a visual test's reference, ` +
        `\`!shot[TestName/shot-name]\`; ${known.length ? `that test has: ${known.join(', ')}` : 'no such test'}`
    )
  }

  return found
}

/** `!shot[TestName/shot-name] Caption` on a line of its own. */
const SHOT_LINE = /^!shot\[([^\]\s]+)\](?:[ \t]+(.+))?$/

/**
 * The body as a list of markdown segments and shots between them. The shot is not markdown syntax
 * and never reaches remark: its `<img>` is spliced in by the generated module, whose imports give
 * the bundler's URL for the file.
 */
const splitShots = (body, language, file, screenshots) => {
  const parts = []
  let markdown = []
  for (const line of body.split('\n')) {
    const match = SHOT_LINE.exec(line)
    if (!match) {
      markdown.push(line)
      continue
    }
    parts.push({ markdown: markdown.join('\n') })
    markdown = []
    parts.push({
      caption: resolveTranslations(match[2]?.trim() ?? '', language, file, { markdown: false }),
      ref: match[1],
      shot: resolveShot(match[1], language, file, screenshots),
    })
  }
  parts.push({ markdown: markdown.join('\n') })

  return parts
}

// ---- pages ------------------------------------------------------------------------------------

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkHtml)

/** The body as the generated module's html parts, with every `{t:key}` and `!shot` bound. */
const renderBody = async (body, language, file, screenshots) => {
  const html = []
  const shots = []
  for (const part of splitShots(body, language, file, screenshots)) {
    if (part.shot) {
      html.push(part)
      shots.push(part.ref)
    } else if (part.markdown.trim()) {
      html.push(String(await processor.process(resolveTranslations(part.markdown, language, file))))
    }
  }

  return { html, shots }
}

/** What every document shares: where it is, what it says, and what its translation was made from. */
const readDocument = async (file, screenshots) => {
  const { language, path } = pageIdentity(file)
  const { body, data, frontmatterLines } = parseFrontmatter(readFileSync(file, 'utf8'), file)
  const { html, shots } = await renderBody(body, language, file, screenshots)

  return { body, data, file, frontmatterLines, html, language, path, shots, sourceDigest: digest(body), sourceHash: data.sourceHash }
}

const readPage = async (file, screenshots) => {
  const { data, ...document } = await readDocument(file, screenshots)

  for (const required of ['title', 'audience', 'order']) {
    if (!data[required]) throw new Error(`${file}: frontmatter is missing ${required}`)
  }
  if (!AUDIENCES.includes(data.audience)) {
    throw new Error(`${file}: audience "${data.audience}" is not one of ${AUDIENCES.join(', ')}`)
  }

  return {
    ...document,
    ...(data.appliesFrom ? { appliesFrom: data.appliesFrom } : {}),
    audience: data.audience,
    covers: data.covers ?? [],
    order: Number(data.order),
    title: data.title,
  }
}

/** The release notes live under this path in each language, one file per version. */
export const NOTES_PATH = 'uutta'
const isReleaseNote = (file) => pageIdentity(file).path.startsWith(`${NOTES_PATH}/`)
const VERSION = /^\d+\.\d+\.\d+$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * A release's notes: `docs/<language>/uutta/<version>.md`, whose frontmatter carries only the
 * release date. The version is the file name, so a note cannot claim a version it is not filed
 * under, and the file exists before the version does -- that is the gate (KOE-1398).
 */
const readReleaseNote = async (file, screenshots) => {
  const { data, ...document } = await readDocument(file, screenshots)
  const version = document.path.slice(NOTES_PATH.length + 1)

  if (!VERSION.test(version)) throw new Error(`${file}: a release note is named by its version, like 1.11.3.md`)
  if (!DATE.test(data.date ?? '')) throw new Error(`${file}: frontmatter needs the release date as yyyy-mm-dd`)

  return { ...document, date: data.date, version }
}

/** Newest first: numeric per segment, so 1.11.10 is newer than 1.11.9. */
const compareVersionsDesc = (a, b) => {
  const as = a.split('.').map(Number)
  const bs = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (as[i] !== bs[i]) return bs[i] - as[i]

  return 0
}

/**
 * Every page and release note of every language, read and bound; throws on the first document
 * that does not bind.
 */
export const loadPages = async () => {
  const screenshots = indexScreenshots()
  const byLanguage = {}
  const notesByLanguage = {}
  const pages = []
  const notes = []
  for (const file of markdownFiles()) {
    if (isReleaseNote(file)) {
      const note = await readReleaseNote(file, screenshots)
      notesByLanguage[note.language] ??= []
      notesByLanguage[note.language].push(note)
      notes.push(note)
    } else {
      const page = await readPage(file, screenshots)
      byLanguage[page.language] ??= []
      byLanguage[page.language].push(page)
      pages.push(page)
    }
  }

  return { byLanguage, documents: [...pages, ...notes], notes, notesByLanguage, pages }
}

/**
 * Every document exists in every language, and a translation names the digest of the original it
 * was made from. Both are checked here rather than left to a reader to notice. Pages and release
 * notes are checked as two maps, since they are looked up apart.
 */
export const translationProblems = (byLanguage) => {
  const source = byLanguage[SOURCE_LANGUAGE] ?? []
  const problems = []

  for (const [language, pages] of Object.entries(byLanguage)) {
    if (language === SOURCE_LANGUAGE) continue

    for (const page of source) {
      const translation = pages.find((candidate) => candidate.path === page.path)
      if (!translation) {
        problems.push(`docs/${language}/${page.path}.md is missing`)
      } else if (translation.sourceHash !== page.sourceDigest) {
        problems.push(
          `docs/${language}/${page.path}.md was translated from ${translation.sourceHash ?? 'nothing'}, ` +
            `but docs/${SOURCE_LANGUAGE}/${page.path}.md is now ${page.sourceDigest}`
        )
      }
    }

    for (const page of pages) {
      if (!source.some((candidate) => candidate.path === page.path)) {
        problems.push(`docs/${language}/${page.path}.md has no ${SOURCE_LANGUAGE} original`)
      }
    }
  }

  return problems
}

export const checkTranslations = ({ byLanguage, notesByLanguage }) => {
  const problems = [...translationProblems(byLanguage), ...translationProblems(notesByLanguage)]
  if (problems.length) throw new Error(`Translations are out of step:\n  ${problems.join('\n  ')}`)
}

// ---- covers -----------------------------------------------------------------------------------

/**
 * The `covers` patterns are paths with `**` and `*`; that is all a page needs to name the code it
 * describes, and all this understands.
 */
const globToRegExp = (pattern) => {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        i++
        if (pattern[i + 1] === '/') {
          i++
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }

  return new RegExp(`^${source}$`)
}

const coversCache = new WeakMap()

/** Whether the page's `covers` name the file. */
export const pageCovers = (page, file) => {
  if (!coversCache.has(page)) coversCache.set(page, page.covers.map(globToRegExp))

  return coversCache.get(page).some((pattern) => pattern.test(file))
}

/** The source-language pages whose `covers` name any of the files. */
export const pagesCovering = (pages, files) =>
  pages.filter((page) => page.language === SOURCE_LANGUAGE && files.some((file) => pageCovers(page, file)))

// ---- links ------------------------------------------------------------------------------------

const LINK = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

/** Every link target in the body, with the line it is on, and whether it was written as an image. */
export const linksIn = (page) => {
  const found = []
  page.body.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(LINK)) {
      found.push({ image: match[0].startsWith('!'), line: page.frontmatterLines + index + 1, target: match[1] })
    }
  })

  return found
}

/** A relative `.md` link resolved from the page's own directory. */
export const relativeLinkTarget = (page, target) => resolve(dirname(page.file), target.split('#')[0])

// ---- the generated module ---------------------------------------------------------------------

const escapeHtml = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

export const render = ({ byLanguage, notesByLanguage }) => {
  const languages = Object.keys(byLanguage).sort()
  // One import per picture, however many pages show it; the bundler hands back its URL.
  const imports = new Map()
  const importFor = (file) => {
    if (!imports.has(file)) imports.set(file, `shot${imports.size}`)

    return imports.get(file)
  }

  const htmlExpression = (parts) =>
    parts
      .map((part) => {
        if (typeof part === 'string') return JSON.stringify(part)

        const caption = escapeHtml(part.caption)
        const figcaption = part.caption ? `<figcaption>${caption}</figcaption>` : ''
        const before = JSON.stringify('<figure class="guide-shot"><img src="')
        const after = JSON.stringify(`" alt="${caption}" loading="lazy">${figcaption}</figure>`)

        return `${before} + ${importFor(part.shot)} + ${after}`
      })
      .join(' +\n        ')

  const pages = languages
    .map((language) => {
      const entries = [...byLanguage[language]]
        .sort((a, b) => a.order - b.order || a.path.localeCompare(b.path))
        .map(({ appliesFrom, audience, html, order, path, title }) =>
          [
            '    {',
            ...(appliesFrom ? [`      appliesFrom: ${JSON.stringify(appliesFrom)},`] : []),
            `      audience: ${JSON.stringify(audience)},`,
            `      html:\n        ${htmlExpression(html)},`,
            `      order: ${order},`,
            `      path: ${JSON.stringify(path)},`,
            `      title: ${JSON.stringify(title)},`,
            '    },',
          ].join('\n')
        )
        .join('\n')

      return `  ${language}: [\n${entries}\n  ],`
    })
    .join('\n')

  const notes = languages
    .map((language) => {
      const entries = [...(notesByLanguage[language] ?? [])]
        .sort((a, b) => compareVersionsDesc(a.version, b.version))
        .map(({ date, html, version }) =>
          [
            '    {',
            `      date: ${JSON.stringify(date)},`,
            `      html:\n        ${htmlExpression(html)},`,
            `      version: ${JSON.stringify(version)},`,
            '    },',
          ].join('\n')
        )
        .join('\n')

      return `  ${language}: [\n${entries}\n  ],`
    })
    .join('\n')

  const importLines = [...imports]
    .map(([file, name]) => `import ${name} from ${JSON.stringify(relative('src/generated/docs', file))}`)
    .join('\n')

  return `// Generated by scripts/build-docs.mjs from docs/. Do not edit; run \`npm run build-docs\`.
${importLines ? `\n${importLines}\n` : ''}
export type DocsAudience = ${AUDIENCES.map((audience) => JSON.stringify(audience)).join(' | ')}

export interface DocsPage {
  /** The version the described feature arrived in, when it is worth saying. */
  readonly appliesFrom?: string
  readonly audience: DocsAudience
  /** Rendered from the markdown at build time; it is repository content, not user input. */
  readonly html: string
  readonly order: number
  /** Path under /ohjeet, and the identity a page shares across languages. */
  readonly path: string
  readonly title: string
}

export const docsPages: Readonly<Record<string, readonly DocsPage[]>> = {
${pages}
}

export interface ReleaseNote {
  /** The release date, yyyy-mm-dd. */
  readonly date: string
  /** Rendered from the markdown at build time; it is repository content, not user input. */
  readonly html: string
  readonly version: string
}

/** Newest first. */
export const releaseNotes: Readonly<Record<string, readonly ReleaseNote[]>> = {
${notes}
}
`
}
