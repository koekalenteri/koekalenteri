import "source-map-support/register";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
const { metricScope } = require("aws-embedded-metrics");

import CustomDynamoClient from "../utils/CustomDynamoClient";
import { response } from "../utils/response";
import { metricsSuccess, metricsError } from "../utils/metrics";
// import { Judge } from "koekalenteri-shared/model/Judge";
import { AWSError } from "aws-sdk";

const dynamoDB = new CustomDynamoClient();

export const getJudgesHandler = metricScope((metrics: any) =>
  async (
    event: APIGatewayProxyEvent,
  ): Promise<APIGatewayProxyResult> => {
    try {
      console.info(process.env.TABLE_NAME);
      const items = await dynamoDB.readAll();
      metricsSuccess(metrics, event.requestContext, "getJudges");
      return response(200, items);
    } catch (err) {
      metricsError(metrics, event.requestContext, "getJudges");
      return response((err as AWSError).statusCode || 501, err);
    }
  }
);
