
export type Replace<T, Key extends keyof T, NewType> = Omit<T, Key> & { [P in Key]: NewType }
export type ReplaceOptional<T, Key extends keyof T, NewType> = Omit<T, Key> & Partial<{ [P in Key]: NewType }>

export type NotOptional<T, Keys extends keyof T> = T & {[Key in Keys]-?: T[Key]}

export type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: DeepPartial<T[P]>;
} : T;
