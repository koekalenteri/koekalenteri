export const AUTH0_DOMAIN = process.env.REACT_APP_AUTH0_DOMAIN ?? ''
export const AUTH0_CLIENT_ID = process.env.REACT_APP_AUTH0_CLIENT_ID ?? ''
export const AUTH0_AUDIENCE = process.env.REACT_APP_AUTH0_AUDIENCE ?? ''

// Optional; defaults to current origin.
export const AUTH0_REDIRECT_URI = process.env.REACT_APP_AUTH0_REDIRECT_URI ?? window.location.origin

export const AUTH0_SCOPE = 'openid profile email'

export function assertAuth0Config() {
  if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_AUDIENCE) {
    throw new Error(
      'Missing Auth0 configuration. Set REACT_APP_AUTH0_DOMAIN, REACT_APP_AUTH0_CLIENT_ID, REACT_APP_AUTH0_AUDIENCE (and optionally REACT_APP_AUTH0_REDIRECT_URI).'
    )
  }
}
