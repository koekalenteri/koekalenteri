import { Root } from 'mdast'
import { Plugin } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

export const removeTableHead: Plugin<void[], string, Root> = () => (tree: any) =>
  visit(tree, (node, index, parent) => {
    if (node.type === 'tableRow' && index === 0 && !parent.headSkipped) {
      parent.children.splice(index, 1)
      parent.headSkipped = true
      return [SKIP, index]
    }
  })
