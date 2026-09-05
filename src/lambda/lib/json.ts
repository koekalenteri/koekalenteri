import { logger } from './log'

export const parseJSONWithFallback = <T>(json?: any, fallback = {}): T => {
  if (!json || typeof json !== 'string') return fallback as T

  try {
    const parsed = JSON.parse(json)
    return parsed
  } catch (e) {
    logger.error('failed to parse json, using fallback', { error: e })

    return fallback as T
  }
}
