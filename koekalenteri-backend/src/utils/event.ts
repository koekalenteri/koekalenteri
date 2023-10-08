import type { APIGatewayProxyEvent } from 'aws-lambda'

import { CONFIG } from '../config'

const { stageName } = CONFIG

export const getApiHost = (event: APIGatewayProxyEvent) => `${event.headers.Host ?? ''}/${stageName}`
