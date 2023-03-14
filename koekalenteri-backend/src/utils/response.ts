import { APIGatewayProxyResult } from 'aws-lambda'

export const response = (statusCode: number, body: unknown): APIGatewayProxyResult => ({
  statusCode: statusCode,
  body: JSON.stringify(body),
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
})

export const redirect = (body: unknown, url: string): APIGatewayProxyResult => ({
  statusCode: 302,
  body: JSON.stringify(body),
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    Location: url,
  },
})
