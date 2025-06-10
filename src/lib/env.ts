import { isJestDefined } from './envHelpers'

export const isDevEnv = (): boolean =>
  (process.env.NODE_ENV === 'development' || Boolean(process.env.REACT_APP_API_BASE_URL?.endsWith('/dev'))) &&
  !isJestDefined()

export const isTestEnv = (): boolean => process.env.NODE_ENV === 'test' || isJestDefined()

export const isProdEnv = (): boolean => process.env.NODE_ENV === 'production'

export const stackName = (): 'koekalenteri-dev' | 'koekalenteri-test' | 'koekalenteri-prod' => {
  if (isDevEnv()) return 'koekalenteri-dev'
  if (isTestEnv()) return 'koekalenteri-test'
  return 'koekalenteri-prod'
}
