import type { APIGatewayProxyEvent } from 'aws-lambda'

export const getOrigin = (event?: Partial<APIGatewayProxyEvent>) =>
  event?.headers?.origin ?? event?.headers?.Origin ?? ''
