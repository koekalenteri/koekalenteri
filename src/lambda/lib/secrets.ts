import type { Parameter } from '@aws-sdk/client-ssm'
import type { KLAPIConfig } from '../types/KLAPI'
import type { PaytrailConfig } from '../types/paytrail'

import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm'

import { CONFIG } from '../config'

const { stackName } = CONFIG

const ssm = new SSMClient()

type CacheEntry = {
  value?: string
  promise?: Promise<string>
  expiresAt?: number
}

const cache: Record<string, CacheEntry> = {}
const TTL_MS = 60 * 60 * 1000 // 60 minutes
const now = (): number => Date.now()

const isFresh = (entry: CacheEntry | undefined): entry is Required<CacheEntry> => {
  return !!entry?.value && !!entry.expiresAt && entry.expiresAt > now()
}

const storeValueInCache = (name: string, value: string): void => {
  cache[name] = {
    value,
    expiresAt: now() + TTL_MS,
  }
}

const storePromiseInCache = (name: string, promise: Promise<string>): void => {
  cache[name] = {
    promise,
  }
}

const resolveCachedParams = <T extends Record<string, string>>(
  names: Extract<keyof T, string>[]
): {
  resolved: T
  toFetch: string[]
  pending: Promise<void>[]
} => {
  const resolved: Partial<T> = {}
  const toFetch: string[] = []
  const pending: Promise<void>[] = []

  for (const name of names) {
    const entry = cache[name]

    if (isFresh(entry)) {
      resolved[name] = entry.value as T[typeof name]
    } else if (entry?.promise) {
      pending.push(
        entry.promise.then((value) => {
          resolved[name] = value as T[typeof name]
        })
      )
    } else {
      toFetch.push(name)
    }
  }

  return { resolved: resolved as T, toFetch, pending }
}

const fetchAndUpdateParams = (names: string[], resolved: Record<string, string>): Promise<void> => {
  const fetchPromise = (async () => {
    const command = new GetParametersCommand({ Names: names })
    const response = await ssm.send(command)
    const params = response.Parameters ?? []

    const paramMap = Object.fromEntries(params.map((p: Parameter) => [p.Name!, p.Value!]))

    for (const name of names) {
      // Use empty string for missing parameters instead of undefined
      const value = paramMap[name] ?? ''

      storeValueInCache(name, value)
      resolved[name] = value
    }
  })()

  // Register the promise for deduplication of concurrent calls
  for (const name of names) {
    storePromiseInCache(
      name,
      fetchPromise.then(() => resolved[name])
    )
  }

  return fetchPromise
}

/**
 * Fetch multiple SSM parameters by name.
 * Returns a map of parameter name -> value.
 * Exported for testing
 */
export async function getSSMParams<T extends Record<string, string>>(names: Extract<keyof T, string>[]): Promise<T> {
  console.log('getSSMParams', names)

  const { resolved, toFetch, pending } = resolveCachedParams<T>(names)

  if (toFetch.length > 0) {
    pending.push(fetchAndUpdateParams(toFetch, resolved))
  }

  await Promise.all(pending)

  return resolved
}

export async function getKLAPIConfig(): Promise<KLAPIConfig> {
  const cfg = await getSSMParams<KLAPIConfig>(['KL_API_URL', 'KL_API_UID', 'KL_API_PWD'])
  if (!cfg.KL_API_URL) {
    throw new Error('Missing KLAPI Config!')
  }
  return cfg
}

export const getPaytrailConfig = async (): Promise<PaytrailConfig> => {
  const stackedCfg = await getSSMParams([`${stackName}-PAYTRAIL_MERCHANT_ID`, `${stackName}-PAYTRAIL_SECRET`])
  const cfg: PaytrailConfig = {
    PAYTRAIL_MERCHANT_ID: stackedCfg[`${stackName}-PAYTRAIL_MERCHANT_ID`],
    PAYTRAIL_SECRET: stackedCfg[`${stackName}-PAYTRAIL_SECRET`],
  }
  if (!cfg.PAYTRAIL_SECRET || !cfg.PAYTRAIL_MERCHANT_ID) {
    throw new Error('Missing Paytrail Config!')
  }
  console.log('merchantId: ' + cfg.PAYTRAIL_MERCHANT_ID)
  return cfg
}

/**
 * Reset the cache - for testing purposes only
 */
export function resetCache(): void {
  Object.keys(cache).forEach((key) => {
    delete cache[key]
  })
}
