import type { APIGatewayProxyEvent } from 'aws-lambda'

export const getOrigin = (event?: Partial<APIGatewayProxyEvent>) =>
  event?.headers?.origin ?? event?.headers?.Origin ?? ''

export const isAwsServiceError = (
  error: unknown
): error is { name?: string; message?: string; $metadata?: { httpStatusCode?: number } } => {
  return typeof error === 'object' && error !== null && 'name' in error
}
