export * from './Cost'
export * from './countries'
export * from './Database'
export * from './Dog'
export * from './Email'
export * from './Event'
export * from './EventType'
export * from './Incremental'
export * from './JSON'
export * from './Location'
export * from './Organizer'
export * from './Person'
export * from './paytrail'
export * from './Registration'
export * from './rules'
export * from './Stats'
export * from './Transaction'
export * from './utility'
export * from './WebSocket'

/** The languages the app speaks, in menu order. Add a language here and the type follows. */
export const LANGUAGES = ['fi', 'en'] as const
export type Language = (typeof LANGUAGES)[number]
