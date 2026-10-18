import type { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
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

/**
 * A transaction DynamoDB cancelled, a condition of one of its items failing among the reasons. The
 * name decides, not `instanceof`: the SDK error may cross a bundling boundary where the class is not
 * the same one, and the name is what the AWS SDK documentation tells callers to match.
 */
export const isTransactionCanceled = (
  error: unknown
): error is Pick<TransactionCanceledException, 'name' | 'CancellationReasons'> =>
  isAwsServiceError(error) && error.name === 'TransactionCanceledException'
