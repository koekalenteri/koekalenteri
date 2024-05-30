export type Replace<T, Key extends keyof T, NewType> = Omit<T, Key> & { [P in Key]: NewType }
export type ReplaceOptional<T, Key extends keyof T, NewType> = Omit<T, Key> & Partial<{ [P in Key]: NewType }>

export type NotOptional<T, Keys extends keyof T = keyof T> = T & { [Key in Keys]-?: T[Key] }

export type RequireAllKeys<T> = { [P in keyof T]-?: T[P] | any } & T

export type DeepPartial<T> = T extends (...arguments_: any[]) => unknown
  ? T | undefined
  : T extends Date
    ? T | undefined
    : T extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T extends object
        ? { [P in keyof T]?: DeepPartial<T[P]> }
        : T | undefined
