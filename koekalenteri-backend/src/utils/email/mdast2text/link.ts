import type { Root } from 'mdast'
import type { Plugin } from 'unified'

import { visit } from 'unist-util-visit'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const linkAsText: Plugin<void[], string, Root> = () => (tree: any) =>
  visit(tree, (node) => {
    if (node.type === 'link') {
      node.children[0].value += ': ' + node.url
    }
  })
