import { ValidationErrorKey } from '../../i18n';

export type ValidationError<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = { key: keyof ValidationErrorKey[NS], opts: { field: keyof T, list?: Array<string>, length?: number, type?: string } };
export type ValidationResult<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = false | ValidationError<T, NS>;
export type WideValidationError<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = keyof ValidationErrorKey[NS] | ValidationError<T, NS>;
export type WideValidationResult<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = boolean | WideValidationError<T, NS>;
export type Validator<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = (value: T, required: boolean) => WideValidationResult<T, NS>;
export type Validators<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = { [Property in keyof T]?: Validator<T, NS> };
