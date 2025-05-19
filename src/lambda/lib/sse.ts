import type { AnyObject } from '../../lib/utils'
import type { UpstashConfig } from '../types/upstash'

import { CONFIG } from '../config'

import { getUpstashConfig } from './secrets'

const { stackName } = CONFIG

let cfg: UpstashConfig

export const sse = async (data: AnyObject) => {
  if (!cfg) cfg = await getUpstashConfig()

  console.log(`Sending event to clients listening "${stackName}", with:`, data)

  await fetch(`${cfg.UPSTASH_REDIS_REST_URL}/xadd/${stackName}/*?maxlen=100`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  })
}
