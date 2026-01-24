// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom

import { toHaveNoViolations } from 'jest-axe'
import { TextDecoder, TextEncoder } from 'util'

// https://github.com/jsdom/jsdom/issues/3363
import 'core-js/stable/structured-clone'
import '@testing-library/jest-dom'
// initialize i18n
import './i18n'

Object.assign(global, { TextDecoder, TextEncoder })

process.env.REACT_APP_IDENTITY_POOL_ID = 'test-id-pool'
jest.mock('./lib/client/rum')

expect.extend(toHaveNoViolations)
