import type { Element, Text } from 'hast'
import type { Text as MdastText, Paragraph, Parents, Table } from 'mdast'
import type { State } from 'mdast-util-to-hast/lib/state'
import { all, one, tableHandler, wrap } from './table'

// The handlers return broad hast content unions; these narrow safely for assertions and fail the
// test loudly when a node is not the expected shape.
function isElement(node: unknown): node is Element {
  return typeof node === 'object' && node !== null && 'type' in node && node.type === 'element'
}

function asElement(node: unknown): Element {
  if (!isElement(node)) throw new Error('Expected a hast element')
  return node
}

function textValue(node: unknown): string | undefined {
  if (typeof node === 'object' && node !== null && 'value' in node && typeof node.value === 'string') {
    return node.value
  }
  return undefined
}

// all()/one() are exercised on purpose with node shapes outside the mdast union (unknown node
// types, missing children); this converts those deliberately invalid fixtures at one named boundary.
const asParents = (node: unknown): Parents => node as Parents

// Building a real mdast-util-to-hast State would need the library's private pipeline; the handlers
// under test only touch these members, so the stand-in is converted at this single boundary.
const mockState = {
  handlers: {
    break: (): Element => ({ children: [], properties: {}, tagName: 'br', type: 'element' }),
    paragraph: (state: State, node: Paragraph): Element => ({
      children: all(state, node),
      properties: {},
      tagName: 'p',
      type: 'element',
    }),
    text: (_state: State, node: MdastText): Text => ({ type: 'text', value: node.value }),
  },
  patch: (_node: unknown, result: Element) => result,
} as unknown as State

describe('table.ts', () => {
  describe('tableHandler', () => {
    it('should convert a markdown table to HTML table', () => {
      // Create a simple markdown table
      const table: Table = {
        align: ['left', 'center', 'right'],
        children: [
          {
            children: [
              { children: [{ type: 'text', value: 'Header 1' }], type: 'tableCell' },
              { children: [{ type: 'text', value: 'Header 2' }], type: 'tableCell' },
              { children: [{ type: 'text', value: 'Header 3' }], type: 'tableCell' },
            ],
            type: 'tableRow',
          },
          {
            children: [
              { children: [{ type: 'text', value: 'Cell 1' }], type: 'tableCell' },
              { children: [{ type: 'text', value: 'Cell 2' }], type: 'tableCell' },
              { children: [{ type: 'text', value: 'Cell 3' }], type: 'tableCell' },
            ],
            type: 'tableRow',
          },
        ],
        type: 'table',
      }

      const result = asElement(tableHandler(mockState, table, undefined))

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')
      expect(result.children.length).toBeGreaterThan(0)

      // Check that the tbody exists
      const tbody = asElement(result.children.find((child) => isElement(child) && child.tagName === 'tbody'))
      expect(tbody).toBeDefined()

      // Check that the rows exist
      expect(tbody.children.some((child) => isElement(child) && child.tagName === 'tr')).toBe(true)
    })

    it('should handle tables without align property', () => {
      // Create a table without align property
      const table: Table = {
        children: [
          {
            children: [
              { children: [{ type: 'text', value: 'Header 1' }], type: 'tableCell' },
              { children: [{ type: 'text', value: 'Header 2' }], type: 'tableCell' },
            ],
            type: 'tableRow',
          },
          {
            children: [
              { children: [{ type: 'text', value: 'Cell 1' }], type: 'tableCell' },
              { children: [{ type: 'text', value: 'Cell 2' }], type: 'tableCell' },
            ],
            type: 'tableRow',
          },
        ],
        type: 'table',
      }

      const result = asElement(tableHandler(mockState, table, undefined))

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')
    })

    it('should omit alignment when a column has no alignment', () => {
      const table: Table = {
        align: [null],
        children: [
          {
            children: [{ children: [{ type: 'text', value: 'Header' }], type: 'tableCell' }],
            type: 'tableRow',
          },
          {
            children: [{ children: [{ type: 'text', value: 'Cell' }], type: 'tableCell' }],
            type: 'tableRow',
          },
        ],
        type: 'table',
      }

      const result = asElement(tableHandler(mockState, table, undefined))
      const tbody = asElement(result.children.find((child) => isElement(child) && child.tagName === 'tbody'))
      const row = asElement(tbody.children.find((child) => isElement(child) && child.tagName === 'tr'))
      const cell = asElement(row.children.find(isElement))

      expect(cell.properties.align).toBeUndefined()
    })

    it('should handle empty cells', () => {
      // Create a table with an empty (null) cell, which a real mdast Table cannot hold
      const table = {
        children: [
          {
            children: [
              { children: [{ type: 'text', value: 'Header' }], type: 'tableCell' },
              null, // Empty cell
            ],
            type: 'tableRow',
          },
        ],
        type: 'table',
      }

      const result = asElement(tableHandler(mockState, table, undefined))

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')
    })
  })

  describe('wrap', () => {
    it('should wrap nodes with newlines when loose is true', () => {
      const nodes: Element[] = [
        { children: [], properties: {}, tagName: 'div', type: 'element' },
        { children: [], properties: {}, tagName: 'span', type: 'element' },
      ]

      const result = wrap(nodes, true)

      // Should have newlines at start, between nodes, and at end
      expect(result).toHaveLength(5)
      expect(result[0].type).toBe('text')
      expect(textValue(result[0])).toBe('\n')
      expect(result[2].type).toBe('text')
      expect(textValue(result[2])).toBe('\n')
      expect(result[4].type).toBe('text')
      expect(textValue(result[4])).toBe('\n')
    })

    it('should not add extra newlines when loose is false', () => {
      const nodes: Element[] = [
        { children: [], properties: {}, tagName: 'div', type: 'element' },
        { children: [], properties: {}, tagName: 'span', type: 'element' },
      ]

      const result = wrap(nodes, false)

      // Should only have a newline between nodes
      expect(result).toHaveLength(3)
      expect(result[0].type).toBe('element')
      expect(result[1].type).toBe('text')
      expect(textValue(result[1])).toBe('\n')
      expect(result[2].type).toBe('element')
    })

    it('should handle empty nodes array', () => {
      const result = wrap([], true)
      expect(result).toHaveLength(1) // Just the initial newline
      expect(result[0].type).toBe('text')
      expect(textValue(result[0])).toBe('\n')

      const result2 = wrap([], false)
      expect(result2).toHaveLength(0) // No nodes, no newlines
    })
  })

  describe('all', () => {
    it('should process all children of a parent node', () => {
      const parent: Paragraph = {
        children: [
          { type: 'text', value: 'Hello' },
          { type: 'text', value: 'World' },
        ],
        type: 'paragraph',
      }

      const result = all(mockState, parent)

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('text')
      expect(textValue(result[0])).toBe('Hello')
      expect(result[1].type).toBe('text')
      expect(textValue(result[1])).toBe('World')
    })

    it('should handle parent without children', () => {
      const parent = asParents({ type: 'someType' })
      const result = all(mockState, parent)
      expect(result).toEqual([])
    })

    it('should remove leading whitespace after breaks', () => {
      const parent: Paragraph = {
        children: [
          { type: 'break' },
          { type: 'text', value: '  Hello' }, // Leading whitespace
        ],
        type: 'paragraph',
      }

      const result = all(mockState, parent)

      expect(result).toHaveLength(2)
      expect(result[1].type).toBe('text')
      expect(textValue(result[1])).toBe('Hello') // Whitespace removed
    })

    it('should remove leading whitespace in elements after breaks', () => {
      // A paragraph inside a paragraph is not valid mdast, but exercises the element branch
      const parent = asParents({
        children: [
          { type: 'break' },
          {
            children: [{ type: 'text', value: '  Hello' }], // Leading whitespace
            type: 'paragraph',
          },
        ],
        type: 'paragraph',
      })

      const result = all(mockState, parent)

      expect(result).toHaveLength(2)
      expect(result[1].type).toBe('element')
      const element = asElement(result[1])
      expect(element.children[0].type).toBe('text')
      expect(textValue(element.children[0])).toBe('Hello') // Whitespace removed
    })

    it('should handle empty results from one()', () => {
      // Create a mock state whose html handler returns undefined
      const customMockState: State = {
        ...mockState,
        handlers: {
          ...mockState.handlers,
          html: () => undefined,
        },
      }

      const parent: Paragraph = {
        children: [
          { type: 'text', value: 'Hello' },
          { type: 'html', value: '<!-- -->' }, // This will return undefined
          { type: 'text', value: 'World' },
        ],
        type: 'paragraph',
      }

      const result = all(customMockState, parent)

      expect(result).toHaveLength(2) // Only 2 items, the empty result is skipped
      expect(result[0].type).toBe('text')
      expect(textValue(result[0])).toBe('Hello')
      expect(result[1].type).toBe('text')
      expect(textValue(result[1])).toBe('World')
    })

    it('should handle array results from one()', () => {
      // Create a mock state whose emphasis handler returns an array
      const customMockState: State = {
        ...mockState,
        handlers: {
          ...mockState.handlers,
          emphasis: () => [
            { type: 'text', value: 'Item 1' },
            { type: 'text', value: 'Item 2' },
          ],
        },
      }

      const parent: Paragraph = {
        children: [
          { type: 'text', value: 'Before' },
          { children: [], type: 'emphasis' }, // This will return an array
          { type: 'text', value: 'After' },
        ],
        type: 'paragraph',
      }

      const result = all(customMockState, parent)

      expect(result).toHaveLength(4) // 1 + 2 + 1 = 4 items
      expect(textValue(result[0])).toBe('Before')
      expect(textValue(result[1])).toBe('Item 1')
      expect(textValue(result[2])).toBe('Item 2')
      expect(textValue(result[3])).toBe('After')
    })
  })

  describe('one', () => {
    it('should process a single node using the appropriate handler', () => {
      const node = { type: 'text', value: 'Hello' }
      const result = one(mockState, node, undefined)

      expect(result).toMatchObject({ type: 'text', value: 'Hello' })
    })

    it('should throw an error for non-nodes', () => {
      expect(() => one(mockState, null, undefined)).toThrow('Expected node, got `null`')
      expect(() => one(mockState, undefined, undefined)).toThrow('Expected node, got `undefined`')
    })

    it('should remove trailing colons from node values', () => {
      const node = { type: 'text', value: 'Hello:' }
      const result = one(mockState, node, undefined)

      expect(result).toMatchObject({ type: 'text', value: 'Hello' }) // Colon removed
    })

    it('should use the unknown handler for unknown node types', () => {
      const node = { type: 'unknown', value: 'Test' }
      const result = one(mockState, node, undefined)

      // The unknown handler should create a div element or use the value
      expect(result).toBeDefined()
    })
  })

  describe('Integration tests', () => {
    it('should correctly process a basic table structure', () => {
      // Create a simple table with basic structure
      const table: Table = {
        align: ['left', 'center'],
        children: [
          {
            children: [
              {
                children: [{ type: 'text', value: 'Header 1' }],
                type: 'tableCell',
              },
              {
                children: [{ type: 'text', value: 'Header 2' }],
                type: 'tableCell',
              },
            ],
            type: 'tableRow',
          },
          {
            children: [
              {
                children: [{ type: 'text', value: 'Cell 1' }],
                type: 'tableCell',
              },
              {
                children: [{ type: 'text', value: 'Cell 2' }],
                type: 'tableCell',
              },
            ],
            type: 'tableRow',
          },
        ],
        type: 'table',
      }

      // Execute the handler with the table
      const result = asElement(tableHandler(mockState, table, undefined))

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')

      // Find the tbody element
      const tbody = asElement(result.children.find((child) => isElement(child) && child.tagName === 'tbody'))
      expect(tbody).toBeDefined()

      // The tableHandler function puts the first row in a separate thead element
      // and only includes subsequent rows in the tbody
      const rows = tbody.children.filter(isElement).filter((child) => child.tagName === 'tr')
      expect(rows).toHaveLength(1) // Only the second row is in tbody

      // Verify the second row exists
      const secondRow = rows[0]
      expect(secondRow).toBeDefined()
      expect(secondRow.type).toBe('element')
      expect(secondRow.tagName).toBe('tr')

      // Verify the cells in the second row
      const cells = secondRow.children.filter(isElement).filter((child) => child.tagName === 'td')
      expect(cells.length).toBeGreaterThan(0)

      // Verify the first cell has content
      const firstCell = cells[0]
      expect(firstCell).toBeDefined()
      expect(firstCell.children.length).toBeGreaterThan(0)
    })
  })
})
