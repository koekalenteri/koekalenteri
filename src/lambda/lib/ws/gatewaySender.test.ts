import type { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import { vi } from 'vitest'
import { sendToConnection } from './gatewaySender'

// sendToConnection only calls gateway.send; the partial doubles convert at these boundaries.
describe('ws/gatewaySender', () => {
  it('returns sent when post succeeds', async () => {
    const gateway = { send: vi.fn().mockResolvedValue({}) } as unknown as ApiGatewayManagementApiClient
    await expect(sendToConnection('c1', Buffer.from('x'), gateway)).resolves.toBe('sent')
  })

  it('returns gone for GoneException', async () => {
    const gateway = {
      send: vi.fn().mockRejectedValue({ name: 'GoneException' }),
    } as unknown as ApiGatewayManagementApiClient
    await expect(sendToConnection('c1', Buffer.from('x'), gateway)).resolves.toBe('gone')
  })
})
