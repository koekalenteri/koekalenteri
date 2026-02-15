import type { ResourcesConfig } from 'aws-amplify'
import type { AwsRumConfig } from 'aws-rum-web'
import { isDevEnv } from './lib/env'

export const AWSConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      // REQUIRED - Amazon Cognito Identity Pool ID
      identityPoolId: process.env.REACT_APP_IDENTITY_POOL_ID ?? '',
      loginWith: {
        oauth: {
          domain: process.env.REACT_APP_OAUTH_DOMAIN ?? '',
          redirectSignIn: [process.env.REACT_APP_REDIRECT_SIGNIN ?? ''],
          redirectSignOut: [process.env.REACT_APP_REDIRECT_SIGNOUT ?? ''],
          responseType: 'code',
          scopes: ['email', 'openid', 'profile'],
        },
      },
      // OPTIONAL - Amazon Cognito Web Client ID (26-char alphanumeric string)
      userPoolClientId: process.env.REACT_APP_CLIENT_ID ?? '',
      // REQUIRED - Amazon Cognito Region
      // region: process.env.REACT_APP_REGION,
      // OPTIONAL - Amazon Cognito User Pool ID
      userPoolId: process.env.REACT_APP_USER_POOL_ID ?? '',
    },
  },
  Geo: {
    LocationService: {
      region: process.env.REACT_APP_REGION ?? '',
    },
  },
}

if (!AWSConfig.Auth?.Cognito.identityPoolId && isDevEnv()) {
  throw new Error('Please configure environment variables in .env (use .env_sample as reference')
}

export const RUM_CONFIG: AwsRumConfig = {
  allowCookies: true,
  enableXRay: false,
  endpoint: process.env.REACT_APP_RUM_ENDPOINT,
  guestRoleArn: process.env.REACT_APP_RUM_ROLE_ARN,
  identityPoolId: process.env.REACT_APP_RUM_IDENTITY_POOL_ID,
  sessionSampleRate: 0.25,
  telemetries: [/*'performance', */ 'errors', 'http'],
}

export const RUM_APPLICATION_ID = process.env.REACT_APP_RUM_APPLICATION_ID
export const RUM_REGION = process.env.REACT_APP_REGION ?? ''
