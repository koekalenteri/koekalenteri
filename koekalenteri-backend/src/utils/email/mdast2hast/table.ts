/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Element, ElementContent } from 'hast'
import type { Table } from 'mdast'
import type { MdastNodes } from 'mdast-util-to-hast/lib'
import type { Handler, MdastParents, State } from 'mdast-util-to-hast/lib/state'

import { u } from 'unist-builder'
import { pointEnd, pointStart } from 'unist-util-position'

const own = {}.hasOwnProperty

export function tableHandler(h: any, node: Table) {
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
      out.push(h(cell, name, { align: align[cellIndex] }, cell ? all(h, cell) : []))
    }

    result[index] = h(rows[index], 'tr', wrap(out, true))
  }

  return h(
    node,
    'table',
    wrap(
      ([] as Element[]).concat(
        result.length > 1
          ? h(
              {
                start: pointStart(result[1]),
                end: pointEnd(result[result.length - 1]),
              },
              'tbody',
              wrap(result.slice(1), true)
            )
          : []
      ),
      true
    )
  )
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

export function all(h: Handler | State, parent: MdastParents) {
  const values: ElementContent[] = []

  if ('children' in parent) {
    const nodes = parent.children
    let index = -1

    while (++index < nodes.length) {
      const result = one(h, nodes[index], parent)

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

export function one(h: any, node: MdastNodes, parent: MdastParents) {
  const type = node?.type
  let fn: Handler = unknown

  // Fail on non-nodes.
  if (!type) {
    throw new Error('Expected node, got `' + node + '`')
  }

  if ('handlers' in h) {
    if (own.call(h.handlers, type)) {
      fn = h.handlers?.[type] ?? unknown
    } else if (h.passThrough?.includes(type)) {
      fn = returnNode
    } else {
      fn = h.unknownHandler ?? unknown
    }
  }

  if ('value' in node) {
    node.value = node.value.replace(/:$/, '')
  }

  return fn(h, node, parent)
}

function returnNode(h: any, node: MdastNodes): any {
  return 'children' in node ? { ...node, children: all(h, node) } : node
}

function unknown(h: any, node: any): any {
  const data = node.data || {}

  if ('value' in node && !(own.call(data, 'hName') || own.call(data, 'hProperties') || own.call(data, 'hChildren'))) {
    return h.augment(node, u('text', node.value))
  }

  return h(node, 'div', all(h, node))
}
