/**
 * A streaming reader for a DynamoDB `scan` dumped as JSON (`{"Items": [ { attr: {S|N|BOOL|...}
 * }, ... ], "Count": .., "ScannedCount": .., "ConsumedCapacity": ..}`). The production copies this
 * reads can be hundreds of megabytes; `JSON.parse`-ing the whole file would hold every row (and
 * every personal-data field inside it) in memory at once. This instead walks the file character by
 * character and yields one item's raw JSON text at a time, so a caller can decode it, pull out the
 * handful of fields it needs and drop the rest.
 *
 * Only the `Items` array is read. Everything before it (just the opening `{"Items": [`) is
 * buffered until found; everything after its closing `]` (`Count`, `ScannedCount`,
 * `ConsumedCapacity`) is never looked at.
 */
import { createReadStream } from 'node:fs'

// A safety net against a file that never contains an "Items" array: buffering the whole thing
// while searching would defeat the point of streaming it.
const MAX_PREAMBLE_LENGTH = 1_000_000

const findItemsArrayStart = (text) => {
  const key = text.indexOf('"Items"')
  if (key === -1) return -1
  return text.indexOf('[', key)
}

/**
 * The tokenizer itself, split out from file reading so tests can feed it exact chunk boundaries
 * (a split mid-string, mid-escape, several items in one chunk, one item spanning two) without
 * writing a temp file for every case. `chunks` is any (sync or async) iterable of strings.
 */
export async function* scanItemsFromChunks(chunks) {
  let buffer = ''
  let started = false
  let finished = false
  let inItem = false
  let inString = false
  let escaped = false
  let depth = 0
  let itemText = ''

  for await (const chunk of chunks) {
    if (finished) break

    let text = chunk
    if (!started) {
      buffer += chunk
      const bracketIndex = findItemsArrayStart(buffer)
      if (bracketIndex === -1) {
        if (buffer.length > MAX_PREAMBLE_LENGTH) {
          throw new Error('dynamoScan: no "Items" array found within the expected preamble')
        }
        continue
      }
      started = true
      text = buffer.slice(bracketIndex + 1)
      buffer = ''
    }

    for (let i = 0; i < text.length; i++) {
      const ch = text[i]

      if (inString) {
        if (inItem) itemText += ch
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }

      if (ch === '"') {
        inString = true
        if (inItem) itemText += ch
        continue
      }

      if (ch === '{') {
        if (inItem) {
          depth++
          itemText += ch
        } else {
          inItem = true
          depth = 0
          itemText = '{'
        }
        continue
      }

      if (ch === '}') {
        if (inItem) {
          itemText += ch
          if (depth === 0) {
            yield itemText
            inItem = false
            itemText = ''
          } else {
            depth--
          }
        }
        continue
      }

      // The closing bracket of the Items array itself: nothing after it matters.
      if (ch === ']' && !inItem) {
        finished = true
        break
      }

      if (inItem) itemText += ch
    }
  }

  if (!started) throw new Error('dynamoScan: no "Items" array found in input')
}

/** `scanItemsFromChunks` against a file on disk, read as a stream of complete UTF-8 chunks. */
export async function* scanItems(filePath) {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  try {
    yield* scanItemsFromChunks(stream)
  } finally {
    stream.destroy()
  }
}

const unmarshallScalar = (attribute) => {
  if (attribute === undefined) return undefined
  if ('S' in attribute) return attribute.S
  if ('N' in attribute) return Number(attribute.N)
  if ('BOOL' in attribute) return attribute.BOOL
  if ('NULL' in attribute) return null
  // M and L (and anything else unexpected): the caller only needs to know the field is present,
  // never its nested content, so hand back the wrapper unchanged rather than unmarshalling it.
  return attribute
}

/**
 * Decodes only the named top-level attributes of a raw DynamoDB item (already `{S|N|BOOL|...}`
 * wrapped), leaving every other attribute -- names, nested objects, anything personal -- untouched
 * and therefore never materialised into a plain value.
 */
export const unmarshallFields = (rawItem, fieldNames) =>
  Object.fromEntries(fieldNames.map((name) => [name, unmarshallScalar(rawItem[name])]))

/** `JSON.parse` plus `unmarshallFields` in one step, for the common case of a scanned item's text. */
export const decodeItem = (itemText, fieldNames) => unmarshallFields(JSON.parse(itemText), fieldNames)
