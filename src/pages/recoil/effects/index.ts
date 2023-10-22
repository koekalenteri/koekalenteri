export * from './log'
export * from './storage'

export const getParamFromFamilyKey = (key: string) => key.split('__')[1]?.slice(1, -1)
