import type { APIGatewayProxyEvent } from 'aws-lambda'
import { CONFIG } from '../config'

export const getOrigin = (event?: Partial<APIGatewayProxyEvent>) =>
  event?.headers?.origin ?? event?.headers?.Origin ?? ''

export const getFrontendOrigin = (event?: Partial<APIGatewayProxyEvent>) => {
  const origin = getOrigin(event)
  return CONFIG.stageName === 'dev' && origin === 'http://localhost:3000' ? origin : CONFIG.frontendURL
}

export const isAwsServiceError = (
  error: unknown
): error is { name?: string; message?: string; $metadata?: { httpStatusCode?: number } } => {
  return typeof error === 'object' && error !== null && 'name' in error
}

export const isConditionalCheckFailure = (error: unknown) =>
  isAwsServiceError(error) && error.name === 'ConditionalCheckFailedException'

/** A transaction DynamoDB cancelled, a condition of one of its items failing among the reasons. */
export const isTransactionCanceled = (error: unknown) =>
  isAwsServiceError(error) && error.name === 'TransactionCanceledException'
