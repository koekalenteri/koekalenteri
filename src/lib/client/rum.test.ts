import type { AwsRum } from 'aws-rum-web'
import * as awsRum from 'aws-rum-web'
import { rum } from './rum'

vi.mock('aws-rum-web')
const rumApplicationId = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock('../../amplify-env', () => ({
  get RUM_APPLICATION_ID() {
    return rumApplicationId.value
  },
  RUM_CONFIG: {},
  RUM_REGION: 'eu-west-1',
}))
vi.unmock('./rum')

describe('rum', () => {
  describe('rum', () => {
    it('should return undefined when there is no RUM_APPLICATION_ID in env', () => {
      expect(rum()).toBeUndefined()
    })

    it('should return AwsRum instance', () => {
      rumApplicationId.value = 'test'

      const mockInstance = {}
      class MockAwsRum {
        constructor() {
          // biome-ignore lint/correctness/noConstructorReturn: its a test
          return mockInstance
        }
      }
      vi.spyOn(awsRum, 'AwsRum').mockImplementation(MockAwsRum as unknown as typeof AwsRum)

      expect(rum()).toEqual(mockInstance)
      expect(rum()).toEqual(mockInstance)
    })
  })
})
