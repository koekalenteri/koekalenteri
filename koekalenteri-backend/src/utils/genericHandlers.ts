import "source-map-support/register";
import { v4 as uuidv4 } from 'uuid';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { response } from "./response";
import { metricsSuccess, metricsError } from "./metrics";
import { AWSError } from "aws-sdk";
import CustomDynamoClient from "./CustomDynamoClient";


export const genericReadAllHandler = (dynamoDB: CustomDynamoClient, name: string): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> =>
  metricScope((metrics: MetricsLogger) =>
    async (
      event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.readAll();
        metricsSuccess(metrics, event.requestContext, name);
        return response(200, items);
      } catch (err) {
        metricsError(metrics, event.requestContext, name);
        return response((err as AWSError).statusCode || 501, err);
      }
    }
  );


export const genericReadHandler = (dynamoDB: CustomDynamoClient, name: string): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> =>
  metricScope((metrics: MetricsLogger) =>
    async (
      event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
      try {
        const item = await dynamoDB.read(event.pathParameters);
        metricsSuccess(metrics, event.requestContext, name);
        return response(200, item);
      } catch (err) {
        metricsError(metrics, event.requestContext, name);
        return response((err as AWSError).statusCode || 501, err);
      }
    }
  );

export const genericWriteHandler = (dynamoDB: CustomDynamoClient, name: string): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> =>
  metricScope((metrics: MetricsLogger) =>
    async (
      event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
      const timestamp = new Date().toISOString();
      if (event.requestContext.authorizer === null || event.body === null) {
        throw new Error("Unauthorized user");
      }
      const username = event.requestContext.authorizer?.claims["cognito:username"];

      try {
        const item = {
          id: uuidv4(),
          ...JSON.parse(event.body || ""),
          createdAt: timestamp,
          createdBy: username,
          modifiedAt: timestamp,
          modifiedBy: username,
        }
        await dynamoDB.write(item);
        metricsSuccess(metrics, event.requestContext, name);
        return response(200, item);
      } catch (err) {
        metricsError(metrics, event.requestContext, name);
        return response((err as AWSError).statusCode || 501, err);
      }
    }
  );
