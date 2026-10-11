import type { fi } from './locales'

type ValidationErrorKey = typeof fi.validation

export type ValidationError<T extends object, NS extends keyof ValidationErrorKey> = {
  key: keyof ValidationErrorKey[NS]
  opts: { field: keyof T; list?: Array<string>; length?: number; state?: string; type?: string }
}
export type ValidationResult<T extends object, NS extends keyof ValidationErrorKey> = false | ValidationError<T, NS>

type WideValidationError<T extends object, NS extends keyof ValidationErrorKey> =
  | keyof ValidationErrorKey[NS]
  | ValidationError<T, NS>

export type WideValidationResult<T extends object, NS extends keyof ValidationErrorKey> =
  | boolean
  | WideValidationError<T, NS>

type Validator2<T extends object, NS extends keyof ValidationErrorKey, T2 extends object> = (
  value: T,
  required: boolean,
  value2: T2
) => WideValidationResult<T, NS>

export type Validators2<T extends object, NS extends keyof ValidationErrorKey, T2 extends object> = {
  [Property in keyof T]?: Validator2<T, NS, T2>
}
