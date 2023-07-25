/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Properties } from 'hast'
import type { Link } from 'mdast'

import { all } from './table'

export function linkHandler(h: any, node: Link) {
  const props: Properties = { href: node.url }

  if (node.title !== null && node.title !== undefined) {
    props.title = node.title
  }

  return h(node, 'a', props, all(h, node))
}
