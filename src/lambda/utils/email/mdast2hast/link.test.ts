import type { Link } from 'mdast'
import type { State } from 'mdast-util-to-hast/lib/state'
import { vi } from 'vitest'
import { linkHandler } from './link'

describe('linkHandler', () => {
  it('calls handler for "a" selector without title', () => {
    const state = {
      all: vi.fn(),
      applyData: vi.fn(),
      one: vi.fn(),
      patch: vi.fn(),
      wrap: vi.fn(),
    }

    const node: Link = {
      children: [],
      type: 'link',
      url: 'url',
    }
    expect(linkHandler(state as unknown as State, node, undefined)).toMatchSnapshot()
  })

  it('calls handler for "a" selector with title', () => {
    const state = {
      all: vi.fn(),
      applyData: vi.fn(),
      one: vi.fn(),
      patch: vi.fn(),
      wrap: vi.fn(),
    }

    const node: Link = {
      children: [],
      title: 'title',
      type: 'link',
      url: 'url',
    }

    expect(linkHandler(state as unknown as State, node, undefined)).toMatchSnapshot()
  })
})
