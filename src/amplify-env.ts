import type { ResourcesConfig } from 'aws-amplify'
import type { AwsRumConfig } from 'aws-rum-web'

import { isDevEnv } from './lib/env'

export const AWSConfig: ResourcesConfig = {
  Geo: {
    LocationService: {
      region: process.env.REACT_APP_REGION ?? '',
    },
  },
  /*
  aws_project_region: process.env.REACT_APP_REGION,
  aws_cognito_identity_pool_id: process.env.REACT_APP_IDENTITY_POOL_ID,
  aws_cognito_region: process.env.REACT_APP_REGION,
  aws_user_pools_id: process.env.REACT_APP_USER_POOL_ID,
  aws_user_pools_web_client_id: process.env.REACT_APP_CLIENT_ID,
  oauth: {
    domain: process.env.REACT_APP_OAUTH_DOMAIN,
    redirectSignIn: process.env.REACT_APP_REDIRECT_SIGNIN,
    redirectSignOut: process.env.REACT_APP_REDIRECT_SIGNOUT,
    responseType: 'code',
  },
  */
  Auth: {
    Cognito: {
      // REQUIRED - Amazon Cognito Identity Pool ID
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID ?? '',
      // REQUIRED - Amazon Cognito Region
      // region: process.env.REACT_APP_REGION,
      // OPTIONAL - Amazon Cognito User Pool ID
      userPoolId: process.env.REACT_APP_USER_POOL_ID ?? '',
      // OPTIONAL - Amazon Cognito Web Client ID (26-char alphanumeric string)
      userPoolClientId: process.env.REACT_APP_CLIENT_ID ?? '',
      loginWith: {
        oauth: {
          domain: process.env.REACT_APP_OAUTH_DOMAIN ?? '',
          redirectSignIn: [process.env.REACT_APP_REDIRECT_SIGNIN ?? ''],
          redirectSignOut: [process.env.REACT_APP_REDIRECT_SIGNOUT ?? ''],
          responseType: 'code',
          scopes: ['email', 'openid', 'profile'],
        },
      },
    },
  },
}

if (!AWSConfig.Auth?.Cognito.identityPoolId && isDevEnv()) {
  throw new Error('Please configure environment variables in .env (use .env_sample as reference')
}

export const RUM_CONFIG: AwsRumConfig = {
  sessionSampleRate: 1,
  guestRoleArn: process.env.REACT_APP_RUM_ROLE_ARN,
  identityPoolId: process.env.REACT_APP_RUM_IDENTITY_POOL_ID,
  endpoint: process.env.REACT_APP_RUM_ENDPOINT,
  telemetries: ['performance', 'errors', 'http'],
  allowCookies: true,
  enableXRay: false,
}

export const RUM_APPLICATION_ID = process.env.REACT_APP_RUM_APPLICATION_ID
export const RUM_REGION = process.env.REACT_APP_REGION ?? ''
