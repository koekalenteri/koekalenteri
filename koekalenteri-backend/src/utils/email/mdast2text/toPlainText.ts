import { Node } from 'unist-builder/lib'

export function toPlainText(node: Node) {
  return one(node)
}

function one(node: any): string {
  return (
    (node &&
      typeof node === 'object' &&
      ((node.value && formatValue(node)) ||
        ('children' in node && all(node.type, node.children)) ||
        (Array.isArray(node) && all('array', node)))) ||
    ''
  )
}

function formatValue(node: { value: string; }) {
  if (node.value.endsWith(':')) {
    return node.value + ' '
  }
  return node.value
}

function all(type: string, values: Node[]) {
  /** @type {Array.<string>} */
  const result = []
  let index = -1

  while (++index < values.length) {
    result[index] = one(values[index])
  }

  if (type === 'tableRow' || type === 'table') {
    result.push("\n")
  }
  if (type === 'paragraph' || type === 'heading') {
    result.push("\n\n")
  }

  return result.join('')
}
