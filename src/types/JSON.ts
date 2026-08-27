export type JsonValue = string | number | boolean | null | JsonArray | JsonObject

export type JsonObject = { [x: string]: JsonValue }
export type JsonArray = Array<JsonValue>
