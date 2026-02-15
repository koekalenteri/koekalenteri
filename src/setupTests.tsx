// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom

import { toHaveNoViolations } from 'jest-axe'
import { TextDecoder, TextEncoder } from 'node:util'

// https://github.com/jsdom/jsdom/issues/3363
// jest/jsdom runtime doesn't provide structuredClone in all configs.
if (typeof globalThis.structuredClone !== 'function') {
  globalThis.structuredClone = (value: unknown) => JSON.parse(JSON.stringify(value))
}

import '@testing-library/jest-dom'
// initialize i18n
import './i18n'

Object.assign(globalThis, { TextDecoder, TextEncoder })

process.env.REACT_APP_IDENTITY_POOL_ID = 'test-id-pool'
jest.mock('./lib/client/rum')

expect.extend(toHaveNoViolations)

// --- MUI anchor element layout mocking ---
// MUI Popover/Menu validates that `anchorEl` is part of document layout by
// reading `getBoundingClientRect()` (and related layout hints). In JSDOM the
// default `getBoundingClientRect()` often returns zeros, which triggers:
// "MUI: The `anchorEl` prop provided to the component is invalid".
//
// We provide a non-zero rect for all elements to keep tests quiet and focused.
// Some test environments mark `HTMLElement.prototype.getBoundingClientRect` as
// non-writable, so assign to the concrete impl prototype instead.
Object.defineProperty(Element.prototype, 'getBoundingClientRect', {
  configurable: true,
  value: function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 40,
      right: 100,
      width: 100,
      height: 40,
      toJSON: () => '',
    } as unknown as DOMRect
  },
})

Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
  configurable: true,
  get() {
    return this
  },
})
