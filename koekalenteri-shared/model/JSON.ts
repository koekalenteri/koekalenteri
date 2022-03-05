export type JSONValue =
  | string
  | number
  | boolean
  | JSONArray
  | JSONObject

export type JSONObject = { [x: string]: JSONValue }
export type JSONArray = Array<JSONValue>
