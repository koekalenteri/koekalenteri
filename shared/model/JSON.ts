export type JsonValue =
  | string
  | number
  | boolean
  | JsonArray
  | JsonObject

export type JsonObject = { [x: string]: JsonValue }
export type JsonArray = Array<JsonValue>
