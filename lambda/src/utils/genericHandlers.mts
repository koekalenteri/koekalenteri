import { v4 as uuidv4 } from 'uuid';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { metricScope, MetricsLogger } from "aws-embedded-metrics";
import { response } from "./response.mjs";
import { metricsSuccess, metricsError } from "./metrics.mjs";
import { CustomDynamoClient } from "./CustomDynamoClient.mjs";


export const genericReadAllHandler = (dynamoDB: CustomDynamoClient, name: string): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> =>
  metricScope((metrics: MetricsLogger) =>
    async (
      event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
      try {
        const items = await dynamoDB.readAll();
        metricsSuccess(metrics, event.requestContext, name);
        return response(200, items);
      } catch (err: any) {
        metricsError(metrics, event.requestContext, name);
        return response(err.statusCode || 501, err);
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
      } catch (err: any) {
        metricsError(metrics, event.requestContext, name);
        return response(err.statusCode || 501, err);
      }
    }
  );

export const genericWriteHandler = (dynamoDB: CustomDynamoClient, name: string): (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> =>
  metricScope((metrics: MetricsLogger) =>
    async (
      event: APIGatewayProxyEvent,
    ): Promise<APIGatewayProxyResult> => {
      authorize(event);

      const timestamp = new Date().toISOString();
      const username = getUsername(event);

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
      } catch (err: any) {
        metricsError(metrics, event.requestContext, name);
        return response(err.statusCode || 501, err);
      }
    }
  );

export function authorize(event: APIGatewayProxyEvent) {
  // TODO: remove unauthorized access
  const authorized = event.requestContext.authorizer !== null
    || event.headers.origin === 'https://dev.koekalenteri.snj.fi'
    || event.headers.origin === 'http://localhost:3000';

  if (!authorized || event.body === null) {
    throw new Error("Unauthorized user");
  }
}

export function getUsername(event: APIGatewayProxyEvent) {
  return event.requestContext.authorizer?.claims["cognito:username"] || 'anonymous';
}
