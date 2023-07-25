import { Literal, Parent } from 'mdast'
import { Node } from 'unist-builder/lib'

type NodeLike = string | Node | Parent | Literal | unknown

export function toPlainText(node: NodeLike) {
  return one(node)
}

const isLiteral = (node: NodeLike): node is Literal => !!node && typeof node === 'object' && 'value' in node
const isParent = (node: NodeLike): node is Parent => !!node && typeof node === 'object' && 'children' in node

function one(node: NodeLike): string {
  if (isLiteral(node)) return formatValue(node)
  if (isParent(node)) return all(node.type, node.children)
  if (Array.isArray(node)) return all('array', node)
  return ''
}

function formatValue(node: Literal) {
  if (node.value.endsWith(':')) {
    return node.value + ' '
  }
  return node.value
}

function all(type: string, values: NodeLike[]) {
  const result: string[] = []
  let index = -1

  while (++index < values.length) {
    result[index] = one(values[index])
  }

  if (type === 'tableRow' || type === 'table') {
    result.push('\n')
  }
  if (type === 'paragraph' || type === 'heading') {
    result.push('\n\n')
  }

  return result.join('')
}
