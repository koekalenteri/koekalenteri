import type { Element } from 'hast'
import type { State } from 'mdast-util-to-hast/lib/state'

import { all, one, tableHandler, wrap } from './table'

// Mock state for testing - using any for flexibility in tests
const mockState = {
  patch: (node: any, result: any) => result,
  handlers: {
    text: (state: any, node: any) => ({ type: 'text', value: node.value }),
    paragraph: (state: any, node: any) => ({
      type: 'element',
      tagName: 'p',
      properties: {},
      children: all(state, node),
    }),
    break: () => ({ type: 'element', tagName: 'br', properties: {}, children: [] }),
  },
} as any as State

describe('table.ts', () => {
  describe('tableHandler', () => {
    it('should convert a markdown table to HTML table', () => {
      // Create a simple markdown table
      const table = {
        type: 'table',
        align: ['left', 'center', 'right'],
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'Header 1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'Header 2' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'Header 3' }] },
            ],
          },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'Cell 1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'Cell 2' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'Cell 3' }] },
            ],
          },
        ],
      }

      const result = tableHandler(mockState, table, undefined) as any

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')
      expect(result.children.length).toBeGreaterThan(0)

      // Check that the tbody exists
      const tbody = result.children.find((child: any) => child.type === 'element' && child.tagName === 'tbody')
      expect(tbody).toBeDefined()

      // Check that the rows exist
      expect(tbody.children.some((child: any) => child.type === 'element' && child.tagName === 'tr')).toBe(true)
    })

    it('should handle tables without align property', () => {
      // Create a table without align property
      const table = {
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'Header 1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'Header 2' }] },
            ],
          },
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'Cell 1' }] },
              { type: 'tableCell', children: [{ type: 'text', value: 'Cell 2' }] },
            ],
          },
        ],
      }

      const result = tableHandler(mockState, table, undefined) as any

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')
    })

    it('should handle empty cells', () => {
      // Create a table with empty cells
      const table = {
        type: 'table',
        children: [
          {
            type: 'tableRow',
            children: [
              { type: 'tableCell', children: [{ type: 'text', value: 'Header' }] },
              null, // Empty cell
            ],
          },
        ],
      }

      const result = tableHandler(mockState, table, undefined) as any

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')
    })
  })

  describe('wrap', () => {
    it('should wrap nodes with newlines when loose is true', () => {
      const nodes: Element[] = [
        { type: 'element', tagName: 'div', properties: {}, children: [] },
        { type: 'element', tagName: 'span', properties: {}, children: [] },
      ]

      const result = wrap(nodes, true)

      // Should have newlines at start, between nodes, and at end
      expect(result.length).toBe(5)
      expect(result[0].type).toBe('text')
      expect((result[0] as any).value).toBe('\n')
      expect(result[2].type).toBe('text')
      expect((result[2] as any).value).toBe('\n')
      expect(result[4].type).toBe('text')
      expect((result[4] as any).value).toBe('\n')
    })

    it('should not add extra newlines when loose is false', () => {
      const nodes: Element[] = [
        { type: 'element', tagName: 'div', properties: {}, children: [] },
        { type: 'element', tagName: 'span', properties: {}, children: [] },
      ]

      const result = wrap(nodes, false)

      // Should only have a newline between nodes
      expect(result.length).toBe(3)
      expect(result[0].type).toBe('element')
      expect(result[1].type).toBe('text')
      expect((result[1] as any).value).toBe('\n')
      expect(result[2].type).toBe('element')
    })

    it('should handle empty nodes array', () => {
      const result = wrap([], true)
      expect(result.length).toBe(1) // Just the initial newline
      expect(result[0].type).toBe('text')
      expect((result[0] as any).value).toBe('\n')

      const result2 = wrap([], false)
      expect(result2.length).toBe(0) // No nodes, no newlines
    })
  })

  describe('all', () => {
    it('should process all children of a parent node', () => {
      const parent: any = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Hello' },
          { type: 'text', value: 'World' },
        ],
      }

      const result = all(mockState, parent)

      expect(result.length).toBe(2)
      expect(result[0].type).toBe('text')
      expect((result[0] as any).value).toBe('Hello')
      expect(result[1].type).toBe('text')
      expect((result[1] as any).value).toBe('World')
    })

    it('should handle parent without children', () => {
      const parent: any = { type: 'someType' }
      const result = all(mockState, parent)
      expect(result).toEqual([])
    })

    it('should remove leading whitespace after breaks', () => {
      const parent: any = {
        type: 'paragraph',
        children: [
          { type: 'break' },
          { type: 'text', value: '  Hello' }, // Leading whitespace
        ],
      }

      const result = all(mockState, parent)

      expect(result.length).toBe(2)
      expect(result[1].type).toBe('text')
      expect((result[1] as any).value).toBe('Hello') // Whitespace removed
    })

    it('should remove leading whitespace in elements after breaks', () => {
      // Using any type to avoid strict mdast type checking in tests
      const parent: any = {
        type: 'paragraph',
        children: [
          { type: 'break' },
          {
            type: 'paragraph',
            children: [{ type: 'text', value: '  Hello' }], // Leading whitespace
          },
        ],
      }

      const result = all(mockState, parent)

      expect(result.length).toBe(2)
      expect(result[1].type).toBe('element')
      const element = result[1] as Element
      expect(element.children[0].type).toBe('text')
      expect((element.children[0] as any).value).toBe('Hello') // Whitespace removed
    })

    it('should handle null results from one()', () => {
      // Create a mock state that returns null for a specific node type
      const customMockState = {
        ...mockState,
        handlers: {
          ...mockState.handlers,
          ignore: () => null,
        },
      } as any as State

      const parent: any = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Hello' },
          { type: 'ignore' }, // This will return null
          { type: 'text', value: 'World' },
        ],
      }

      const result = all(customMockState, parent)

      expect(result.length).toBe(2) // Only 2 items, the null result is skipped
      expect(result[0].type).toBe('text')
      expect((result[0] as any).value).toBe('Hello')
      expect(result[1].type).toBe('text')
      expect((result[1] as any).value).toBe('World')
    })

    it('should handle array results from one()', () => {
      // Create a mock state that returns an array for a specific node type
      const customMockState = {
        ...mockState,
        handlers: {
          ...mockState.handlers,
          multiple: () => [
            { type: 'text', value: 'Item 1' },
            { type: 'text', value: 'Item 2' },
          ],
        },
      } as any as State

      const parent: any = {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Before' },
          { type: 'multiple' }, // This will return an array
          { type: 'text', value: 'After' },
        ],
      }

      const result = all(customMockState, parent)

      expect(result.length).toBe(4) // 1 + 2 + 1 = 4 items
      expect((result[0] as any).value).toBe('Before')
      expect((result[1] as any).value).toBe('Item 1')
      expect((result[2] as any).value).toBe('Item 2')
      expect((result[3] as any).value).toBe('After')
    })
  })

  describe('one', () => {
    it('should process a single node using the appropriate handler', () => {
      const node = { type: 'text', value: 'Hello' }
      const result = one(mockState, node, undefined) as any

      expect(result.type).toBe('text')
      expect(result.value).toBe('Hello')
    })

    it('should throw an error for non-nodes', () => {
      expect(() => one(mockState, null as any, undefined)).toThrow('Expected node, got `null`')
      expect(() => one(mockState, undefined as any, undefined)).toThrow('Expected node, got `undefined`')
    })

    it('should remove trailing colons from node values', () => {
      const node = { type: 'text', value: 'Hello:' }
      const result = one(mockState, node, undefined) as any

      expect(result.type).toBe('text')
      expect(result.value).toBe('Hello') // Colon removed
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
      const table = {
        type: 'table',
        align: ['left', 'center'],
        children: [
          {
            type: 'tableRow',
            children: [
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Header 1' }],
              },
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Header 2' }],
              },
            ],
          },
          {
            type: 'tableRow',
            children: [
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Cell 1' }],
              },
              {
                type: 'tableCell',
                children: [{ type: 'text', value: 'Cell 2' }],
              },
            ],
          },
        ],
      }

      // Execute the handler with the table
      const result = tableHandler(mockState, table, undefined) as any

      // Verify the structure of the result
      expect(result.type).toBe('element')
      expect(result.tagName).toBe('table')

      // Find the tbody element
      const tbody = result.children.find((child: any) => child.type === 'element' && child.tagName === 'tbody')
      expect(tbody).toBeDefined()

      // The tableHandler function puts the first row in a separate thead element
      // and only includes subsequent rows in the tbody
      const rows = tbody.children.filter((child: any) => child.type === 'element' && child.tagName === 'tr')
      expect(rows.length).toBe(1) // Only the second row is in tbody

      // Verify the second row exists
      const secondRow = rows[0]
      expect(secondRow).toBeDefined()
      expect(secondRow.type).toBe('element')
      expect(secondRow.tagName).toBe('tr')

      // Verify the cells in the second row
      const cells = secondRow.children.filter((child: any) => child.type === 'element' && child.tagName === 'td')
      expect(cells.length).toBeGreaterThan(0)

      // Verify the first cell has content
      const firstCell = cells[0]
      expect(firstCell).toBeDefined()
      expect(firstCell.children.length).toBeGreaterThan(0)
    })
  })
})
