import { Root } from 'mdast'
import { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

export const linkAsText: Plugin<void[], string, Root> = () => (tree: any) =>
  visit(tree, (node) => {
    if (node.type === 'link') {
      node.children[0].value += ': ' + node.url
    }
  })
