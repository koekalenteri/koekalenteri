import type { Link } from 'mdast'
import type { State } from 'mdast-util-to-hast/lib/state'
import { jest } from '@jest/globals'
import { linkHandler } from './link'

describe('linkHandler', () => {
  it('calls handler for "a" selector without title', () => {
    const state = {
      all: jest.fn(),
      applyData: jest.fn(),
      one: jest.fn(),
      patch: jest.fn(),
      wrap: jest.fn(),
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
      all: jest.fn(),
      applyData: jest.fn(),
      one: jest.fn(),
      patch: jest.fn(),
      wrap: jest.fn(),
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
