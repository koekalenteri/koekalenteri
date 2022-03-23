import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { metricsError, metricsSuccess } from "../utils/metrics.mjs";
import { response } from "../utils/response.mjs";
import KLAPI from "../utils/KLAPI.mjs";

const klapi = new KLAPI();

export const getEventTypesHandler = metricScope((metrics: MetricsLogger) =>
  async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      // const refresh = event.queryStringParameters && 'refresh' in event.queryStringParameters;

      const { status, json } = await klapi.lueKoemuodot();

      metricsSuccess(metrics, event.requestContext, 'getEventTypesHandler');
      return response(status, json);
    } catch (err: any) {
      console.error(err);
      metricsError(metrics, event.requestContext, 'getEventTypesHandler');
      return response(err.statusCode || 501, err);
    }
  }
);

