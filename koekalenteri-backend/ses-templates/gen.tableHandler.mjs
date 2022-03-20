import {u} from 'unist-builder'
import {pointStart, pointEnd} from 'unist-util-position'

const own = {}.hasOwnProperty

export default function tableHandler(h, node) {
  const rows = node.children
  let index = -1
  const align = node.align || []
  /** @type {Array<Element>} */
  const result = []

  while (++index < rows.length) {
    const row = rows[index].children
    /** @type {Array<Content>} */
    const out = []
    let cellIndex = -1
    const length = node.align ? align.length : row.length

    while (++cellIndex < length) {
      const cell = row[cellIndex]
      const name = cellIndex === 0 ? 'th' : 'td'
      out.push(
        h(cell, name, {align: align[cellIndex]}, cell ? all(h, cell) : [])
      )
    }

    result[index] = h(rows[index], 'tr', wrap(out, true))
  }

  return h(
    node,
    'table',
    wrap(
      [].concat(
        result[1]
          ? h(
            {
              start: pointStart(result[1]),
              end: pointEnd(result[result.length - 1])
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

export function wrap(nodes, loose) {
  /** @type {Array<Content>} */
  const result = []
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

export function all(h, parent) {
  /** @type {Array<Content>} */
  const values = []

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

export function one(h, node, parent) {
  const type = node && node.type
  /** @type {Handler} */
  let fn

  // Fail on non-nodes.
  if (!type) {
    throw new Error('Expected node, got `' + node + '`')
  }

  if (own.call(h.handlers, type)) {
    fn = h.handlers[type]
  } else if (h.passThrough && h.passThrough.includes(type)) {
    fn = returnNode
  } else {
    fn = h.unknownHandler
  }
  node.value = node.value.replace(/:$/, '');

  return (typeof fn === 'function' ? fn : unknown)(h, node, parent)
}

function returnNode(h, node) {
  return 'children' in node ? {...node, children: all(h, node)} : node
}

function unknown(h, node) {
  const data = node.data || {}

  if (
    'value' in node &&
    !(
      own.call(data, 'hName') ||
      own.call(data, 'hProperties') ||
      own.call(data, 'hChildren')
    )
  ) {
    return h.augment(node, u('text', node.value))
  }

  return h(node, 'div', all(h, node))
}
