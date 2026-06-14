import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import { jest } from '@jest/globals'
import { sendToConnection } from './gatewaySender'

describe('ws/gatewaySender', () => {
  it('returns sent when post succeeds', async () => {
    const gateway = { send: jest.fn<any>().mockResolvedValue({}) } as unknown as ApiGatewayManagementApiClient
    await expect(sendToConnection('c1', Buffer.from('x'), gateway)).resolves.toBe('sent')
  })

  it('returns gone for GoneException', async () => {
    const gateway = {
      send: jest.fn<any>().mockRejectedValue({ name: 'GoneException' }),
    } as unknown as ApiGatewayManagementApiClient
    await expect(sendToConnection('c1', Buffer.from('x'), gateway)).resolves.toBe('gone')
  })
})
