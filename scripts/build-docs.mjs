#!/usr/bin/env node

/**
 * Turns the markdown under `docs/` into one generated module the frontend imports.
 *
 * The conversion happens here rather than in the browser for two reasons: the remark chain is
 * already a dependency (the lambda renders email markdown with it), so this costs the client
 * nothing, and Amplify's rewrite rule sends everything without a known extension to index.html --
 * a `.md` fetched at runtime would silently return the application's HTML instead.
 *
 * `--check` regenerates and compares instead of writing, so a stale generated file fails a commit
 * rather than reaching a reader.
 */

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

const DOCS_DIR = 'docs'
const OUT_FILE = 'src/generated/docs/index.ts'
/** The language every other language is translated from. */
const SOURCE_LANGUAGE = 'fi'
const AUDIENCES = ['participant', 'secretary', 'admin']

const check = process.argv.includes('--check')

const markdownFiles = (dir, found = []) => {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) markdownFiles(full, found)
    else if (full.endsWith('.md')) found.push(full)
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

  return { body: source.slice(match[0].length), data }
}

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkHtml)

/** Short digest of a translation's source, so a changed original shows up as a stale translation. */
const digest = (body) => createHash('sha256').update(body.trim()).digest('hex').slice(0, 6)

const readPage = async (file) => {
  const [, language, ...rest] = relative('.', file).split('/')
  const path = rest.join('/').replace(/\.md$/, '')
  const { body, data } = parseFrontmatter(readFileSync(file, 'utf8'), file)

  for (const required of ['title', 'audience', 'order']) {
    if (!data[required]) throw new Error(`${file}: frontmatter is missing ${required}`)
  }
  if (!AUDIENCES.includes(data.audience)) {
    throw new Error(`${file}: audience "${data.audience}" is not one of ${AUDIENCES.join(', ')}`)
  }

  return {
    ...(data.appliesFrom ? { appliesFrom: data.appliesFrom } : {}),
    audience: data.audience,
    covers: data.covers ?? [],
    html: String(await processor.process(body)),
    order: Number(data.order),
    path,
    sourceDigest: digest(body),
    sourceHash: data.sourceHash,
    title: data.title,
  }
}

/**
 * Every page exists in every language, and a translation names the digest of the original it was
 * made from. Both are checked here rather than left to a reader to notice.
 */
const checkTranslations = (byLanguage) => {
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

  if (problems.length) {
    throw new Error(`Translations are out of step:\n  ${problems.join('\n  ')}`)
  }
}

const render = (byLanguage) => {
  const languages = Object.keys(byLanguage).sort()
  const pages = languages
    .map((language) => {
      const entries = [...byLanguage[language]]
        .sort((a, b) => a.order - b.order || a.path.localeCompare(b.path))
        .map(({ appliesFrom, audience, html, order, path, title }) =>
          [
            '    {',
            ...(appliesFrom ? [`      appliesFrom: ${JSON.stringify(appliesFrom)},`] : []),
            `      audience: ${JSON.stringify(audience)},`,
            `      html: ${JSON.stringify(html)},`,
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

  return `// Generated by scripts/build-docs.mjs from docs/. Do not edit; run \`npm run build-docs\`.

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
`
}

const byLanguage = {}
for (const file of markdownFiles(DOCS_DIR)) {
  const [, language] = relative('.', file).split('/')
  byLanguage[language] ??= []
  byLanguage[language].push(await readPage(file))
}

checkTranslations(byLanguage)
const output = render(byLanguage)

if (check) {
  const current = readFileSync(OUT_FILE, 'utf8')
  if (current !== output) {
    console.error(`${OUT_FILE} is out of date. Run \`npm run build-docs\` and commit the result.`)
    process.exit(1)
  }
  console.log(`✅ ${OUT_FILE} is up to date`)
} else {
  await mkdir('src/generated/docs', { recursive: true })
  writeFileSync(OUT_FILE, output)
  const count = Object.values(byLanguage).reduce((sum, pages) => sum + pages.length, 0)
  console.log(`✅ ${count} pages in ${Object.keys(byLanguage).length} languages into ${OUT_FILE}`)
}
