import type { APIGatewayProxyEvent } from 'aws-lambda'

export const getApiHost = (event: APIGatewayProxyEvent) => event.headers.Host ?? ''
