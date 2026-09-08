import type { AwsRum } from 'aws-rum-web'
import * as awsRum from 'aws-rum-web'
import { flushPromises } from 'test-utils/utils'
import { recordError, recordEvent, recordPageView } from './rum'

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
  // Runs first: the client is loaded once and cached, so the unconfigured case has to be asked
  // before anything has configured it.
  it('does not load the client when there is no application id', async () => {
    const whenUnavailable = vi.fn()
    const construct = vi.spyOn(awsRum, 'AwsRum')

    recordError('test', whenUnavailable)
    await flushPromises()

    expect(whenUnavailable).toHaveBeenCalledTimes(1)
    expect(construct).not.toHaveBeenCalled()
  })

  it('loads the client once and records through it', async () => {
    rumApplicationId.value = 'test'
    const instance = { recordError: vi.fn(), recordEvent: vi.fn(), recordPageView: vi.fn() }
    class MockAwsRum {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: its a test
        return instance
      }
    }
    // A class double cannot carry AwsRum's statics; the constructor converts here.
    const construct = vi.spyOn(awsRum, 'AwsRum').mockImplementation(MockAwsRum as unknown as typeof AwsRum)

    recordPageView('/kokeet')
    recordEvent('dnd-group-rejected', { eventId: 'event1' })
    recordError('test')
    await flushPromises()

    expect(construct).toHaveBeenCalledTimes(1)
    expect(instance.recordPageView).toHaveBeenCalledWith('/kokeet')
    expect(instance.recordEvent).toHaveBeenCalledWith('dnd-group-rejected', { eventId: 'event1' })
    expect(instance.recordError).toHaveBeenCalledWith('test')
  })
})
