import type { APIGatewayEventRequestContext } from 'aws-lambda'
import { createMetricsLogger, Unit } from 'aws-embedded-metrics'
import { logger } from './log'

/** Absent when a lambda is invoked directly (`aws lambda invoke`) instead of through API Gateway. */
type RequestContext = APIGatewayEventRequestContext | undefined

/**
 * Counts one request a wrapped handler did not answer 200, as `Error` of its service in the
 * KoekalenteriApp namespace. Lambda's own Errors sees only an invocation that throws, and the wrapper
 * answers every failure instead. A successful request writes nothing: AWS/Lambda Invocations counts
 * it for free, and each custom metric is billed per month (KOE-1602).
 */
export const countError = async (context: RequestContext, service: string): Promise<void> => {
  const metrics = createMetricsLogger()
  metrics.setNamespace('KoekalenteriApp')
  metrics.putDimensions({ Service: service })
  metrics.setProperty('RequestId', context?.requestId)
  metrics.putMetric('Error', 1, Unit.Count)
  try {
    await metrics.flush()
  } catch (error) {
    // A lost count must not turn the answer into a failure of its own.
    logger.warn('error metric not written', { error })
  }
}
