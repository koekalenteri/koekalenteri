import type { AnyObject } from '../../lib/utils'

import { CONFIG } from '../config'

export const broadcastEvent = async (data: AnyObject) => {
  const { stackName } = CONFIG

  console.log(`TODO: Sending event to clients listening "${stackName}", with:`, data)
  /*

  await fetch(`${config.SSE_API_URL}?channel=${stackName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.SSE_API_TOKEN}`,
    },
    body: JSON.stringify(data),
  })
    */
}
