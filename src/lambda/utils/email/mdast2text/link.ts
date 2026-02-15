import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

export const linkAsText: Plugin = () => (tree: any) =>
  visit(tree, (node) => {
    if (node.type === 'link') {
      node.children[0].value += `: ${node.url}`
    }
  })
