import { APIGatewayEventRequestContextWithAuthorizer } from "aws-lambda";
const {metricScope, Unit} = require("aws-embedded-metrics");

const metricsCount = (metrics: any, label: string, count: number, context: APIGatewayEventRequestContextWithAuthorizer<any>, service: string) => { 
    metrics.setNamespace('KoekalenteriApp');
    metrics.putDimensions({ Service: service});
    metrics.setProperty('RequestId', context.requestId);
    metrics.putMetric(label, count, Unit.Count);
}

export const metricsSuccess = (metrics: any, context: APIGatewayEventRequestContextWithAuthorizer<any>, service: string) => {
    metricsCount(metrics, "Success", 1, context, service);
}

export const metricsError = (metrics: any, context: APIGatewayEventRequestContextWithAuthorizer<any>, service: string) => {
    metricsCount(metrics, "Error", 1, context, service);
}