import "source-map-support/register";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { metricScope, MetricsLogger } from "aws-embedded-metrics";

import CustomDynamoClient from "../utils/CustomDynamoClient";
import { response } from "../utils/response";
import { metricsSuccess, metricsError } from "../utils/metrics";
import { AWSError } from "aws-sdk";

const dynamoDB = new CustomDynamoClient();

export const getOrganizersHandler = metricScope((metrics: MetricsLogger) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      const items = await dynamoDB.readAll();
      metricsSuccess(metrics, event.requestContext, "getOrganizers");
      return response(200, items);
    } catch (err) {
      metricsError(metrics, event.requestContext, "getOrganizers");
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);
