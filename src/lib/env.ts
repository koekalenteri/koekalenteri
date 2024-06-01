export const isDevEnv = () => process.env.NODE_ENV === 'development' && typeof jest === 'undefined'

export const isTestEnv = () => process.env.NODE_ENV === 'test' || typeof jest !== 'undefined'

export const isProdEnv = () => process.env.NODE_ENV === 'production'
