import { genericWriteTest } from '../../test-utils/genericTests'

// Dynamic to allow mocks (with ESM)
const { putEventHandler } = await import('./event')

import.meta.jest.mock('aws-sdk/clients/ses', () => {
  const mSES = {
    sendTemplatedEmail: jest.fn().mockReturnThis(),
    promise: jest.fn(),
  }
  return jest.fn(() => mSES)
})

describe('Test putEventHandler (generic)', genericWriteTest(putEventHandler))
