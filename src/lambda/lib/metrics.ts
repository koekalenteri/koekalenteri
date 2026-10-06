import type { MetricsLogger } from 'aws-embedded-metrics'
import type { APIGatewayEventRequestContext } from 'aws-lambda'
import { Unit } from 'aws-embedded-metrics'

/** Absent when a lambda is invoked directly (`aws lambda invoke`) instead of through API Gateway. */
type RequestContext = APIGatewayEventRequestContext | undefined

const metricsCount = (
  metrics: MetricsLogger,
  label: string,
  count: number,
  context: RequestContext,
  service: string
) => {
  metrics.setNamespace('KoekalenteriApp')
  metrics.putDimensions({ Service: service })
  metrics.setProperty('RequestId', context?.requestId)
  metrics.putMetric(label, count, Unit.Count)
}

export const metricsSuccess = (metrics: MetricsLogger, context: RequestContext, service: string): void => {
  metricsCount(metrics, 'Success', 1, context, service)
}

export const metricsError = (metrics: MetricsLogger, context: RequestContext, service: string): void => {
  metricsCount(metrics, 'Error', 1, context, service)
}
