import { Properties } from 'hast'
import { Link } from 'mdast'
import { State } from 'mdast-util-to-hast/lib/state'

import { all } from './table'

export function linkHandler(h: State, node: Link) {
  const props: Properties = { href: node.url }

  if (node.title !== null && node.title !== undefined) {
    props.title = node.title
  }

  return h(node, 'a', props, all(h, node))
}
