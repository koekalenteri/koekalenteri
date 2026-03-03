import type { Element, Properties } from 'hast'
import type { Link } from 'mdast'
import type { Handler } from 'mdast-util-to-hast/lib/state'

export const linkHandler: Handler = (state, node: Link) => {
  const props: Properties = { href: node.url }

  if (node.title !== null && node.title !== undefined) {
    props.title = node.title
  }

  const link: Element = {
    children: state.all(node),
    properties: props,
    tagName: 'a',
    type: 'element',
  }

  return link
}
