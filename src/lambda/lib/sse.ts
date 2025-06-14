import type { AnyObject } from '../../lib/utils'

import { CONFIG } from '../config'

import { getSSEConfig } from './secrets'

export const sse = async (data: AnyObject) => {
  const config = await getSSEConfig()
  const { stackName } = CONFIG

  console.log(`Sending event to clients listening "${stackName}", with:`, data)

  await fetch(`${config.SSE_API_URL}?channel=${stackName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.SSE_API_TOKEN}`,
    },
    body: JSON.stringify(data),
  })
}
