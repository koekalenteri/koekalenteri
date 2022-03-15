export type JsonValue =
  | string
  | number
  | boolean
  | JsonArray
  | JsonObject

export type JsonObject = { [x: string]: JsonValue }
export type JsonArray = Array<JsonValue>

export type Replace<T, Key extends keyof T, NewType> = Omit<T, Key> & { [P in Key]: NewType }
