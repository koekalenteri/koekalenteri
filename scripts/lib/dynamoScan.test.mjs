import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { decodeItem, scanItems, scanItemsFromChunks, unmarshallFields } from './dynamoScan.mjs'

const collect = async (iterable) => {
  const items = []
  for await (const item of iterable) items.push(item)
  return items
}

describe('scanItemsFromChunks', () => {
  it('yields each item of a single chunk', async () => {
    const text = '{"Items": [{"a": {"S": "one"}}, {"a": {"S": "two"}}], "Count": 2}'
    const items = await collect(scanItemsFromChunks([text]))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ a: { S: 'one' } }, { a: { S: 'two' } }])
  })

  it('finds the Items array when other keys come before it', async () => {
    const text = '{"ConsumedCapacity": null, "Items": [{"a": {"N": "1"}}]}'
    const items = await collect(scanItemsFromChunks([text]))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ a: { N: '1' } }])
  })

  it('ignores Count, ScannedCount and ConsumedCapacity after the array closes', async () => {
    const text = '{"Items": [{"a": {"N": "1"}}], "Count": 1, "ScannedCount": 1, "ConsumedCapacity": {"x": 1}}'
    const items = await collect(scanItemsFromChunks([text]))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ a: { N: '1' } }])
  })

  it('reassembles an item split across chunks mid-string', async () => {
    // The split lands inside the string value "hello world", between "hello " and "world".
    const whole = '{"Items": [{"name": {"S": "hello world"}}]}'
    const splitAt = whole.indexOf('hello ') + 'hello '.length
    const chunks = [whole.slice(0, splitAt), whole.slice(splitAt)]
    const items = await collect(scanItemsFromChunks(chunks))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ name: { S: 'hello world' } }])
  })

  it('reassembles an item split across chunks mid-escape sequence', async () => {
    // The string value is a literal backslash-quote: "a\"b". Split between the backslash and the
    // quote it escapes, so one chunk ends with a dangling escape.
    const whole = String.raw`{"Items": [{"name": {"S": "a\"b"}}]}`
    const splitAt = whole.indexOf('\\') + 1
    const chunks = [whole.slice(0, splitAt), whole.slice(splitAt)]
    const items = await collect(scanItemsFromChunks(chunks))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ name: { S: 'a"b' } }])
  })

  it('yields several items found within one chunk', async () => {
    const text = '{"Items": [{"a": {"N": "1"}}, {"a": {"N": "2"}}, {"a": {"N": "3"}}]}'
    const items = await collect(scanItemsFromChunks([text]))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ a: { N: '1' } }, { a: { N: '2' } }, { a: { N: '3' } }])
  })

  it('reassembles one item whose nested object spans two chunks', async () => {
    const whole = '{"Items": [{"a": {"N": "1"}, "nested": {"M": {"b": {"S": "x"}}}}]}'
    const splitAt = whole.indexOf('"M"') + 2
    const chunks = [whole.slice(0, splitAt), whole.slice(splitAt)]
    const items = await collect(scanItemsFromChunks(chunks))
    expect(items.map((item) => JSON.parse(item))).toEqual([
      { a: { N: '1' }, nested: { M: { b: { S: 'x' } } } },
    ])
  })

  it('throws when no Items array is ever found', async () => {
    await expect(collect(scanItemsFromChunks(['{"Count": 0}']))).rejects.toThrow(/no "Items" array/)
  })

  it('refuses to buffer more than the preamble safety cap while still searching for "Items"', async () => {
    // Over 1,000,000 characters with no "Items" key anywhere: this must not be mistaken for the
    // "search the whole, smaller input and never find it" case above -- it has its own message,
    // because buffering this much is itself the problem, before the search has even concluded.
    const chunks = ['x'.repeat(1_000_001)]
    await expect(collect(scanItemsFromChunks(chunks))).rejects.toThrow(/within the expected preamble/)
  })

  it('does not throw for a preamble just under the safety cap, once Items arrives', async () => {
    // Pins the cap from the other side: the case above alone would still pass with the cap
    // mutated down to 0 (any preamble at all would then exceed it), since both a real cap and a
    // broken one throw the same message for a large enough input. A preamble of about 999,999
    // characters -- just under the 1,000,000 cap -- must still be accepted, so a shrunk cap fails
    // this case instead.
    const filler = 'x'.repeat(333_333)
    const chunks = [filler, filler, filler.slice(0, 333_333), '{"Items": [{"a": {"N": "1"}}]}']
    expect(chunks.slice(0, 3).join('').length).toBe(999_999)
    const items = await collect(scanItemsFromChunks(chunks))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ a: { N: '1' } }])
  })
})

describe('scanItems', () => {
  let dir

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'dynamo-scan-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reads items from a real file end to end', async () => {
    const filePath = join(dir, 'scan.json')
    await writeFile(
      filePath,
      JSON.stringify({ Items: [{ id: { S: 'a' } }, { id: { S: 'b' } }], Count: 2, ScannedCount: 2 })
    )

    const items = await collect(scanItems(filePath))
    expect(items.map((item) => JSON.parse(item))).toEqual([{ id: { S: 'a' } }, { id: { S: 'b' } }])
  })
})

describe('unmarshallFields', () => {
  it('decodes S, N and BOOL scalars and leaves missing fields undefined', () => {
    const rawItem = { amount: { N: '4500' }, deleted: { BOOL: false }, status: { S: 'ok' } }
    expect(unmarshallFields(rawItem, ['amount', 'deleted', 'status', 'missing'])).toEqual({
      amount: 4500,
      deleted: false,
      missing: undefined,
      status: 'ok',
    })
  })

  it('returns the wrapper unchanged for M and L fields, for presence checks only', () => {
    const rawItem = { dog: { M: { regNo: { S: 'FI123' } } }, results: { L: [] } }
    const decoded = unmarshallFields(rawItem, ['dog', 'results'])
    expect(decoded.dog).toEqual({ M: { regNo: { S: 'FI123' } } })
    expect(decoded.results).toEqual({ L: [] })
  })

  it('decodes a NULL attribute to null', () => {
    const rawItem = { refundAt: { NULL: true } }
    expect(unmarshallFields(rawItem, ['refundAt'])).toEqual({ refundAt: null })
  })
})

describe('decodeItem', () => {
  it('parses the raw text and unmarshalls the requested fields in one step', () => {
    const text = '{"eventId": {"S": "evt-1"}, "paidAmount": {"N": "45"}}'
    expect(decodeItem(text, ['eventId', 'paidAmount', 'id'])).toEqual({ eventId: 'evt-1', id: undefined, paidAmount: 45 })
  })
})
