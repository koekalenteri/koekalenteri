export const isDevEnv = () => process.env.NODE_ENV === 'development' && typeof jest === 'undefined'

export const isTestEnv = () => process.env.NODE_ENV === 'test' || typeof jest !== 'undefined'

export const isProdEnv = () => process.env.NODE_ENV === 'production'

export const stackName = (): 'koekalenteri-dev' | 'koekalenteri-test' | 'koekalenteri-prod' => {
  if (isDevEnv()) return 'koekalenteri-dev'
  if (isTestEnv()) return 'koekalenteri-test'
  return 'koekalenteri-prod'
}
