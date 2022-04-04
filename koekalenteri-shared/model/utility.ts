
export type Replace<T, Key extends keyof T, NewType> = Omit<T, Key> & { [P in Key]: NewType }
export type ReplaceOptional<T, Key extends keyof T, NewType> = Omit<T, Key> & Partial<{ [P in Key]: NewType }>

export type NotOptional<T, Keys extends keyof T> = T & {[Key in Keys]-?: T[Key]}

// https://stackoverflow.com/a/68699273/10359775
export type PartialDeep<T> = T extends string | number | bigint | boolean | null | undefined | symbol | Date
  ? T | undefined
  // Arrays, Sets and Maps and their readonly counterparts have their items made
  // deeply partial, but their own instances are left untouched
  : T extends Array<infer ArrayType>
  ? Array<PartialDeep<ArrayType>>
  : T extends ReadonlyArray<infer ArrayType>
  ? ReadonlyArray<ArrayType>
  : T extends Set<infer SetType>
  ? Set<PartialDeep<SetType>>
  : T extends ReadonlySet<infer SetType>
  ? ReadonlySet<SetType>
  : T extends Map<infer KeyType, infer ValueType>
  ? Map<PartialDeep<KeyType>, PartialDeep<ValueType>>
  : T extends ReadonlyMap<infer KeyType, infer ValueType>
  ? ReadonlyMap<PartialDeep<KeyType>, PartialDeep<ValueType>>
  // ...and finally, all other objects.
  : {
    [K in keyof T]?: PartialDeep<T[K]>;
  };
