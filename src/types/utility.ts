export type Replace<T, Key extends keyof T, NewType> = Omit<T, Key> & { [P in Key]: NewType }
export type ReplaceOptional<T, Key extends keyof T, NewType> = Omit<T, Key> & Partial<{ [P in Key]: NewType }>

export type NotOptional<T, Keys extends keyof T = keyof T> = T & { [Key in Keys]-?: T[Key] }

export type RequireAllKeys<T> = { [P in keyof T]-?: unknown } & T

export type DeepPartial<T> = T extends (...arguments_: unknown[]) => unknown
  ? T | undefined
  : T extends Date
    ? T | undefined
    : T extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T extends object
        ? { [P in keyof T]?: DeepPartial<T[P]> }
        : T | undefined

type PatchValue<T> = T extends (...arguments_: unknown[]) => unknown
  ? T | undefined | null
  : T extends Date
    ? T | undefined | null
    : T extends Array<infer U>
      ? Array<PatchValue<U>> | undefined | null
      : T extends object
        ? Patch<T> | undefined | null
        : T | undefined | null

export type Patch<T extends object> = {
  [P in keyof T]?: PatchValue<T[P]>
}

export type AtLeastOne<T> = [T, ...T[]]

export type KeyofExcluding<T, E extends keyof T> = { [K in keyof T]: K extends E ? never : K }[keyof T]
