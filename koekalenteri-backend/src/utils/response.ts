import { APIGatewayProxyResult } from "aws-lambda";

export const response = (statusCode: number, body: any): APIGatewayProxyResult => ({
    statusCode: statusCode,
    body: JSON.stringify(body),
    headers: {['Content-Type']: 'application/json'},
})