import { APIGatewayEventRequestContext } from "aws-lambda";
import { MetricsLogger, Unit } from "aws-embedded-metrics";

const metricsCount = (metrics: MetricsLogger, label: string, count: number, context: APIGatewayEventRequestContext, service: string) => {
  metrics.setNamespace('KoekalenteriApp');
  metrics.putDimensions({ Service: service});
  metrics.setProperty('RequestId', context.requestId);
  metrics.putMetric(label, count, Unit.Count);
}

export const metricsSuccess = (metrics: MetricsLogger, context: APIGatewayEventRequestContext, service: string): void => {
  metricsCount(metrics, "Success", 1, context, service);
}

export const metricsError = (metrics: MetricsLogger, context: APIGatewayEventRequestContext, service: string): void => {
  metricsCount(metrics, "Error", 1, context, service);
}
