import {all} from './table.mjs'

/**
 * @type {Handler}
 * @param {Link} node
 */
export default function link(h, node) {
  /** @type {Properties} */
  const props = {href: node.url}

  if (node.title !== null && node.title !== undefined) {
    props.title = node.title
  }

  return h(node, 'a', props, all(h, node))
}
