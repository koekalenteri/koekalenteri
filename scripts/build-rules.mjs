#!/usr/bin/env node

/**
 * Extracts the Kennel Club's retriever trial rules from their PDF into docs/fi/saannot/, as one
 * markdown document the guides build like any other page -- except that this one is nobody's to
 * write: a new edition is a new PDF and a rerun, not a rewrite (KOE-1399).
 *
 * The PDF is typeset, not structured, so the structure is read off the type: the page number
 * is the small figure at the foot, a part starts with a 14 pt "OSA n", a chapter is a 10 pt line,
 * a section a 9 pt line that begins with its number, and everything else is body text justified
 * to the column -- a line that stops short of the column's right edge ends its paragraph. Words
 * hyphenated across lines are put back together, except where the hyphen was the word's own.
 *
 * Usage: build-rules.mjs [--source <pdf>] [--out <markdown>]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)

const SOURCE = option('--source', 'docs/sources/noutajien-kokeet-2023-04-15.pdf')
const OUT = option('--out', 'docs/fi/saannot/noutajien-kokeet.md')
const SOURCE_URL = 'https://www.kennelliitto.fi/lomakkeet/noutajien-rodunomaisten-kokeiden-saannot'

const FRONTMATTER = {
  amended: '2025-05-07',
  approved: '2022-11-26',
  edition: '2023-04-15',
  source: SOURCE_URL,
  sourceFile: SOURCE,
  title: 'Noutajien rodunomaisten kokeiden säännöt ja ohjeet',
}

// ---- lines off the page -----------------------------------------------------------------------

/** The text items of a page as lines: same baseline, left to right, with the type's size. */
const linesOf = (content) => {
  const rows = new Map()
  for (const item of content.items) {
    if (!('str' in item) || item.str === '') continue
    const [, , , , x, y] = item.transform
    const key = Math.round(y)
    const row = rows.get(key) ?? { items: [], y: key }
    row.items.push({ font: item.fontName, height: Math.round(item.height), str: item.str, width: item.width, x })
    rows.set(key, row)
  }

  return [...rows.values()]
    .sort((a, b) => b.y - a.y)
    .map(({ items, y }) => {
      items.sort((a, b) => a.x - b.x)
      const text = items
        .map((item) => item.str)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      const sized = items.filter((item) => item.height > 0)
      const height = Math.max(...sized.map((item) => item.height), 0)
      const fonts = new Set(sized.map((item) => item.font))
      const left = Math.min(...items.map((item) => item.x))
      const right = Math.max(...items.map((item) => item.x + item.width))
      return { fonts, height, left, right, text, y }
    })
    .filter((line) => line.text)
}

const PAGE_NUMBER_HEIGHT = 8
const BODY_HEIGHT = 9
const CHAPTER_HEIGHT = 10
const PART_HEIGHT = 14
const SECTION = /^(\d+\.\d+)\.\s+(.+)$/
const SUBSECTION = /^(\d+\.\d+\.\d+)\.?\s+(.+)$/
/** The trial type repeated at the head of every page of its chapter: NOU, NOME-A, NOWT... */
const RUNNING_HEAD = /^[A-ZÄÖÅ-]{2,7}$/
/** A points table row set with dot leaders: "A 1 .........4". */
const LEADER = /^(.+?)\s*\.{3,}\s*(\d+)$/
const PART = /^OSA \d+$/

// ---- the document as blocks -------------------------------------------------------------------

/**
 * One pass over the pages, turning lines into blocks: part, chapter, section, subsection, heading
 * (a bold run-in line without a number), bullet and paragraph text. The blocks carry the state
 * the paragraph logic needs -- whether the last line reached the column's edge -- so a paragraph
 * can run over a page break.
 */
const readBlocks = async (doc) => {
  const blocks = []
  let started = false
  let open // the block still taking lines: a paragraph, bullet, chapter, part or section title

  const close = () => {
    open = undefined
  }
  const push = (block) => {
    blocks.push(block)
    open = block
  }

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber)
    let lines = linesOf(await page.getTextContent())

    const partIndex = lines.findIndex((line) => line.height === PART_HEIGHT && PART.test(line.text))
    if (!started) {
      if (partIndex < 0) continue
      started = true
    }
    // A part's opening page carries a banner above the "OSA n" line; the part starts at the line.
    if (partIndex > 0) lines = lines.slice(partIndex)

    const body = lines.filter((line) => line.height === BODY_HEIGHT)
    const columnRight = Math.max(...body.map((line) => line.right), 0)
    const columnLeft = Math.min(...body.map((line) => line.left), Number.POSITIVE_INFINITY)
    const bodyFont = mostCommonFont(body)

    for (const line of lines) {
      if (line.height <= PAGE_NUMBER_HEIGHT) continue

      if (line.height === PART_HEIGHT) {
        if (PART.test(line.text)) push({ lines: [], number: line.text, type: 'part' })
        continue
      }

      if (line.height === CHAPTER_HEIGHT) {
        if (RUNNING_HEAD.test(line.text)) continue
        if (open?.type === 'part' || open?.type === 'chapter') {
          open.lines.push(line.text)
        } else {
          push({ lines: [line.text], type: 'chapter' })
        }
        continue
      }

      const section = SECTION.exec(line.text) ?? SUBSECTION.exec(line.text)
      if (section) {
        push({
          fonts: line.fonts,
          lines: [section[2]],
          number: section[1],
          type: SUBSECTION.test(line.text) ? 'subsection' : 'section',
        })
        continue
      }

      // A section title that wrapped: the same face as the numbered line, and nothing else yet.
      if (
        (open?.type === 'section' || open?.type === 'subsection') &&
        [...line.fonts].every((font) => open.fonts.has(font))
      ) {
        open.lines.push(line.text)
        continue
      }

      const bold = ![...line.fonts].includes(bodyFont)
      const bullet = line.text.startsWith('•')
      const indented = line.left > columnLeft + 5
      const short = line.right < columnRight - 6

      if (bullet) {
        push({ lines: [line.text.replace(/^•\s*/, '')], open: !short, type: 'bullet' })
      } else if (bold && !indented && /^[A-ZÄÖÅ]/.test(line.text) && (!open || open.type === 'heading')) {
        // A run-in heading inside a section ("Vesityö", "Haku"): bold, on lines of its own, where
        // no paragraph is waiting for its next line -- a bold line mid-paragraph is emphasis.
        if (open?.type === 'heading' && open.open) open.lines.push(line.text)
        else push({ lines: [line.text], type: 'heading' })
        open.open = !short
        // A heading names; a bold line that ends in punctuation is a sentence set in bold.
        if (/[.,;:]$/.test(line.text)) open.type = 'paragraph'
        if (!open.open) close()
      } else if (open?.open && (open.type === 'paragraph' || open.type === 'bullet' || open.type === 'heading')) {
        // What looked like a heading but ran to the edge and goes on in plain type was a sentence.
        if (open.type === 'heading') open.type = 'paragraph'
        open.lines.push(line.text)
        open.open = !short
      } else if (open?.type === 'bullet' && indented) {
        open.lines.push(line.text)
        open.open = !short
      } else {
        push({ lines: [line.text], open: !short, type: 'paragraph' })
      }
      if (open && !open.open && (open.type === 'paragraph' || open.type === 'bullet')) close()
    }
  }

  return blocks
}

const mostCommonFont = (lines) => {
  const counts = new Map()
  for (const line of lines) for (const font of line.fonts) counts.set(font, (counts.get(font) ?? 0) + 1)

  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
}

// ---- lines into text --------------------------------------------------------------------------

/**
 * The lines of a block as one text. A line ending in a hyphen continues its word on the next,
 * unless the hyphen belongs to the word -- "A-metsästyskoe", "SM-koe" -- which the capitals before
 * it give away. A hyphen set off by a space is the typesetter's, not the word's.
 */
const joinLines = (lines) => {
  let text = ''
  for (const line of lines) {
    if (!text) {
      text = line
    } else if (/ -$/.test(text)) {
      text = text.slice(0, -2) + line
    } else if (/[a-zäöå]-$/.test(text) && /^[a-zäöå]/.test(line)) {
      text = text.slice(0, -1) + line
    } else if (/[A-ZÄÖÅ]-$/.test(text)) {
      text = text + line
    } else {
      text = `${text} ${line}`
    }
  }

  return text.replace(/\s+/g, ' ').trim()
}

// ---- markdown ---------------------------------------------------------------------------------

const heading = (level, text) => `${'#'.repeat(level)} ${text}`

const toMarkdown = (blocks) => {
  const out = []
  for (const block of blocks) {
    const text = joinLines(block.lines)
    switch (block.type) {
      case 'part':
        out.push(heading(2, `${block.number}: ${text}`))
        break
      case 'chapter':
        out.push(heading(3, text))
        break
      case 'section':
        out.push(heading(4, `${block.number} ${text}`))
        break
      case 'subsection':
        out.push(heading(5, `${block.number} ${text}`))
        break
      case 'heading':
        out.push(`**${text}**`)
        break
      case 'bullet':
        out.push(`- ${text}`)
        break
      default: {
        const leader = LEADER.exec(text)
        if (leader) {
          // The points tables of the championship rules: "Tulos Pisteet" above rows of dot leaders.
          const previous = out.at(-1)
          if (previous?.endsWith('Tulos Pisteet')) {
            out[out.length - 1] = previous.slice(0, -'Tulos Pisteet'.length).trim()
            if (!out.at(-1)) out.pop()
            out.push('| Tulos | Pisteet |', '| --- | --- |')
          } else if (!previous?.startsWith('| ')) {
            out.push('| Tulos | Pisteet |', '| --- | --- |')
          }
          out.push(`| ${leader[1].trim()} | ${leader[2]} |`)
        } else if (/^[a-zäöå(]/.test(text) && out.length && !/^(#|- |\| |\*\*)/.test(out.at(-1))) {
          // A paragraph that starts mid-sentence is the rest of the one before it: the type
          // changed underneath it (an amendment set in bold) and the column logic broke it off.
          out[out.length - 1] = `${out.at(-1)} ${text}`
        } else {
          out.push(text)
        }
      }
    }
  }

  // Bullets stay a list; everything else is its own paragraph.
  return out
    .map((line, index) => {
      const next = out[index + 1]
      const listed = (line.startsWith('- ') && next?.startsWith('- ')) || (line.startsWith('| ') && next?.startsWith('| '))
      return listed ? line : `${line}\n`
    })
    .join('\n')
    .trim()
}

const doc = await getDocument({ data: new Uint8Array(readFileSync(SOURCE)), useSystemFonts: true }).promise
const blocks = await readBlocks(doc)
const markdown = toMarkdown(blocks)

const frontmatter = Object.entries(FRONTMATTER)
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n')
writeFileSync(OUT, `---\n${frontmatter}\n---\n\n${markdown}\n`)

const sections = blocks.filter((block) => block.type === 'section' || block.type === 'subsection').length
console.log(`✅ ${sections} sections from ${doc.numPages} pages of ${SOURCE} into ${OUT}`)
