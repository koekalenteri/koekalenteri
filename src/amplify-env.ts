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
  telemetries: [/*'performance', */ ['errors', { ignore: shouldIgnoreRumError }], 'http'],
}

const TOKEN_EXPIRED_MESSAGE = '401 The incoming token has expired'
const EXTERNAL_OBJECT_NOT_FOUND_MESSAGE = 'Object Not Found Matching Id:2, MethodName:update, ParamCount:4'

const getErrorMessage = (error: unknown): string | undefined => {
  if (error instanceof ErrorEvent) {
    return error.error instanceof Error ? error.error.message : error.message
  }
  if (typeof PromiseRejectionEvent !== 'undefined' && error instanceof PromiseRejectionEvent) {
    return getErrorMessage(error.reason)
  }
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }

  return undefined
}

export function shouldIgnoreRumError(error: unknown): boolean {
  const message = getErrorMessage(error)
  if (message?.includes(TOKEN_EXPIRED_MESSAGE) || message === EXTERNAL_OBJECT_NOT_FOUND_MESSAGE) {
    return true
  }

  if (!(error instanceof ErrorEvent)) {
    return false
  }

  return (
    error.filename === 'webkit-masked-url://hidden/' &&
    error.message === "Can't find variable: observer" &&
    error.error instanceof Error &&
    error.error.stack?.includes('observeDOMChanges@webkit-masked-url://hidden/') === true &&
    error.error.stack.includes('showFloatingViewBasedOnOverlaySettings@webkit-masked-url://hidden/')
  )
}

export const RUM_APPLICATION_ID = process.env.REACT_APP_RUM_APPLICATION_ID
export const RUM_REGION = process.env.REACT_APP_REGION ?? ''
