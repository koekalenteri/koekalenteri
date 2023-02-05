import { all } from './table'

/**
 * @type {Handler}
 * @param {Link} node
 */
export default function link(h: any, node: any) {
  /** @type {Properties} */
  const props: any = { href: node.url }

  if (node.title !== null && node.title !== undefined) {
    props.title = node.title
  }

  return h(node, 'a', props, all(h, node))
}
