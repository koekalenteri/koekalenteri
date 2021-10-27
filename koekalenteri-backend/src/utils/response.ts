import { APIGatewayProxyResult } from "aws-lambda";

export const response = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode: statusCode,
  body: JSON.stringify(body),
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  },
});
