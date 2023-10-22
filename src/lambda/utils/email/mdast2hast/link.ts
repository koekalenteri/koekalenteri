import type { Properties } from 'hast'
import type { Link } from 'mdast'
import type { Element } from 'mdast-util-to-hast/lib/handlers/link'
import type { Handler } from 'mdast-util-to-hast/lib/state'

export const linkHandler: Handler = (state, node: Link) => {
  const props: Properties = { href: node.url }

  if (node.title !== null && node.title !== undefined) {
    props.title = node.title
  }

  const link: Element = {
    type: 'element',
    tagName: 'a',
    properties: props,
    children: state.all(node),
  }

  return link
}
