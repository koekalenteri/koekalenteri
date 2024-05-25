import type { AwsRum } from 'aws-rum-web'

import * as awsRum from 'aws-rum-web'

import * as amplifyEnv from '../../amplify-env'

import { rum } from './rum'

jest.mock('aws-rum-web')
jest.unmock('./rum')

describe('rum', () => {
  describe('rum', () => {
    it('should return undefined when there is no RUM_APPLICATION_ID in env', () => {
      expect(rum()).toBeUndefined()
    })

    it('should return AwsRum instance', () => {
      jest.replaceProperty(amplifyEnv, 'RUM_APPLICATION_ID', 'test')

      const mockInstance = {}
      jest.spyOn(awsRum, 'AwsRum').mockImplementation(() => mockInstance as unknown as AwsRum)

      expect(rum()).toEqual(mockInstance)
      expect(rum()).toEqual(mockInstance)
    })
  })
})
