import {jest} from '@jest/globals'
import { Link } from 'mdast'
import { State } from 'mdast-util-to-hast/lib/state'

import { linkHandler } from './link'


describe('linkHandler', () => {
  it('calls handler for "a" selector', () => {
    const h = jest.fn<State>()
    const node: Link = {
      url: 'url',
      type: 'link',
      children: [],
    }
    linkHandler(h as unknown as State, node)
    expect(h).toHaveBeenCalledWith(node, 'a', {href: 'url'}, [])
  })
})
