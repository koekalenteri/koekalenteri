import { ValidationErrorKey } from '../../i18n';

export type ValidationError<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = { key: keyof ValidationErrorKey[NS], opts: { field: keyof T, list?: Array<string>, length?: number, state?: string, type?: string } };
export type ValidationResult<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = false | ValidationError<T, NS>;
export type WideValidationError<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = keyof ValidationErrorKey[NS] | ValidationError<T, NS>;
export type WideValidationResult<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = boolean | WideValidationError<T, NS>;
export type Validator<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = (value: T, required: boolean) => WideValidationResult<T, NS>;
export type Validators<T extends Record<string, any>, NS extends keyof ValidationErrorKey> = { [Property in keyof T]?: Validator<T, NS> };
export type Validator2<T extends Record<string, any>, NS extends keyof ValidationErrorKey, T2 extends Record<string, any>> = (value: T, required: boolean, value2: T2) => WideValidationResult<T, NS>;
export type Validators2<T extends Record<string, any>, NS extends keyof ValidationErrorKey, T2 extends Record<string, any>> = { [Property in keyof T]?: Validator2<T, NS, T2> };
