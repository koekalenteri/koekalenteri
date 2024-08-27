export type Replace<T, Key extends keyof T, NewType> = Omit<T, Key> & { [P in Key]: NewType }
export type ReplaceOptional<T, Key extends keyof T, NewType> = Omit<T, Key> & Partial<{ [P in Key]: NewType }>

export type NotOptional<T, Keys extends keyof T = keyof T> = T & { [Key in Keys]-?: T[Key] }

export type RequireAllKeys<T> = { [P in keyof T]-?: any } & T

export type DeepPartial<T> = T extends (...arguments_: any[]) => unknown
  ? T | undefined
  : T extends Date
    ? T | undefined
    : T extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T extends object
        ? { [P in keyof T]?: DeepPartial<T[P]> }
        : T | undefined

/** Mimics the result of Object.keys(...) */
export type KeysOf<o> = o extends readonly unknown[]
  ? number extends o['length']
    ? `${number}`
    : keyof o & `${number}`
  : {
      [K in keyof o]: K extends string ? K : K extends number ? `${K}` : never
    }[keyof o]

export type AtLeastOne<T> = [T, ...T[]]
