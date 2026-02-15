import type { AwsRumConfig } from 'aws-rum-web'

export const RUM_CONFIG: AwsRumConfig = {
  sessionSampleRate: 0.25,
  guestRoleArn: process.env.REACT_APP_RUM_ROLE_ARN,
  identityPoolId: process.env.REACT_APP_RUM_IDENTITY_POOL_ID,
  endpoint: process.env.REACT_APP_RUM_ENDPOINT,
  telemetries: [/*'performance', */ 'errors', 'http'],
  allowCookies: true,
  enableXRay: false,
}

export const RUM_APPLICATION_ID = process.env.REACT_APP_RUM_APPLICATION_ID
export const RUM_REGION = process.env.REACT_APP_REGION ?? ''
