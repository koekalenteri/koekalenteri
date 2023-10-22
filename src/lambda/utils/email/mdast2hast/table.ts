import type { Element, ElementContent } from 'hast'
import type { Table } from 'mdast'
import type { Handler, MdastParents, State } from 'mdast-util-to-hast/lib/state'

import { u } from 'unist-builder'

const own = {}.hasOwnProperty

export const tableHandler: Handler = (state, node: Table, parent) => {
  const rows = node.children
  let index = -1
  const align = node.align || []
  const result: Element[] = []

  while (++index < rows.length) {
    const row = rows[index].children
    const out: Element[] = []
    let cellIndex = -1
    const length = node.align ? align.length : row.length

    while (++cellIndex < length) {
      const cell = row[cellIndex]
      const name = cellIndex === 0 ? 'th' : 'td'
      out.push({
        type: 'element',
        tagName: name,
        properties: { align: align[cellIndex] },
        children: cell ? all(state, cell) : [],
      })
    }

    result[index] = {
      type: 'element',
      tagName: 'tr',
      properties: {},
      children: wrap(out, true),
    }
  }

  return {
    type: 'element',
    tagName: 'table',
    properties: {},
    children: wrap(
      [
        {
          type: 'element',
          tagName: 'tbody',
          properties: {},
          children: wrap(result.slice(1), true),
        },
      ],
      true
    ),
  }
}

export function wrap(nodes: Element[], loose: boolean) {
  const result: ElementContent[] = []
  let index = -1

  if (loose) {
    result.push(u('text', '\n'))
  }

  while (++index < nodes.length) {
    if (index) result.push(u('text', '\n'))
    result.push(nodes[index])
  }

  if (loose && nodes.length > 0) {
    result.push(u('text', '\n'))
  }

  return result
}

export function all(state: State, parent: MdastParents) {
  const values: ElementContent[] = []

  if ('children' in parent) {
    const nodes = parent.children
    let index = -1

    while (++index < nodes.length) {
      const result = one(state, nodes[index], parent)

      if (result) {
        if (index && nodes[index - 1].type === 'break') {
          if (!Array.isArray(result) && result.type === 'text') {
            result.value = result.value.replace(/^\s+/, '')
          }

          if (!Array.isArray(result) && result.type === 'element') {
            const head = result.children[0]

            if (head && head.type === 'text') {
              head.value = head.value.replace(/^\s+/, '')
            }
          }
        }

        if (Array.isArray(result)) {
          values.push(...result)
        } else {
          values.push(result)
        }
      }
    }
  }

  return values
}

export const one: Handler = (state, node: any, parent) => {
  const type = node?.type

  // Fail on non-nodes.
  if (!type) {
    throw new Error('Expected node, got `' + node + '`')
  }

  const fn: Handler = state?.handlers?.[type as keyof State['handlers']] ?? unknown

  if ('value' in node) {
    node.value = node.value.replace(/:$/, '')
  }

  return fn(state, node, parent)
}

function unknown(state: State, node: any): any {
  const data = node.data || {}

  if ('value' in node && !(own.call(data, 'hName') || own.call(data, 'hProperties') || own.call(data, 'hChildren'))) {
    return state.patch(node, u('text', node.value))
  }

  return { ...node, tagName: 'div', children: all(state, node) }
}
