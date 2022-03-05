import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { AWSError } from "aws-sdk";
import { metricsError, metricsSuccess } from "../utils/metrics";
import { response } from "../utils/response";
import KLAPI from "../utils/KLAPI";

const klapi = new KLAPI();

export const getEventTypesHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      // const refresh = event.queryStringParameters && 'refresh' in event.queryStringParameters;

      const { status, json } = await klapi.lueKoemuodot();

      metricsSuccess(metrics, event.requestContext, 'getEventTypesHandler');
      return response(status, json);
    } catch (err) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getEventTypesHandler');
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);

