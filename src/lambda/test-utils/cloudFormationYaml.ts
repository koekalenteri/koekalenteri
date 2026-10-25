/**
 * Reading CloudFormation templates in tests: the YAML with its intrinsic tags, the shape checks the
 * readers share, and the intrinsics resolved to the values a deployed stack would see.
 */
import type { YAMLSeq } from 'yaml'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

/** Builds dist/template.yaml from template/ the way the deploy does, and answers its text. */
export const buildAppTemplate = (): string => {
  execFileSync(process.execPath, ['scripts/build-template.mjs'], { stdio: 'ignore' })

  return readFileSync('dist/template.yaml', 'utf8')
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const stringField = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export const recordField = (record: Record<string, unknown>, key: string): Record<string, unknown> => {
  const value = record[key]
  return isRecord(value) ? value : {}
}

/** A field that may be one value or a list of them, as a list. */
export const listField = (record: Record<string, unknown>, key: string): unknown[] => {
  const value = record[key]
  if (Array.isArray(value)) return value
  return value === undefined ? [] : [value]
}

/**
 * The intrinsics the templates use. A similar list lives in scripts/lib/tables.mjs and
 * e2e/server/routes.mjs; it is not imported from there because the lambda tsconfig has no allowJs,
 * so lint-backend could not type it.
 */
const INTRINSICS = ['Ref', 'Sub', 'GetAtt', 'Join', 'Select', 'Split', 'If', 'Equals', 'Not', 'Condition']

const scalarTag = (name: string) => ({
  identify: (): boolean => false,
  resolve: (value: string) => ({ [name]: value }),
  tag: `!${name}`,
})

/** Scalars keep their tag as a one-key object; the list forms (`!Join [...]`) become plain lists. */
const flatTags = INTRINSICS.flatMap((name) => [
  { collection: 'seq' as const, identify: (): boolean => false, tag: `!${name}` },
  scalarTag(name),
])

/** Every form keeps its tag as a one-key object: `!Join ['-', [a, b]]` is `{ Join: ['-', ['a', 'b']] }`. */
const taggedTags = INTRINSICS.flatMap((name) => [
  {
    collection: 'seq' as const,
    identify: (): boolean => false,
    resolve: (list: YAMLSeq) => ({ [name]: list.toJSON() }),
    tag: `!${name}`,
  },
  scalarTag(name),
])

export const parseTemplate = (text: string): unknown => parse(text, { customTags: flatTags })

export const parseTaggedTemplate = (text: string): Record<string, unknown> => {
  const parsed: unknown = parse(text, { customTags: taggedTags })
  if (!isRecord(parsed)) throw new Error('template is not a map')
  return parsed
}

/**
 * What a `!Ref` or `!GetAtt` names resolves to: `ref('AWS::StackName')`, `ref('DeployRole.Arn')`.
 * Answers undefined for a name it does not know, which makes the value unresolvable.
 */
type RefResolver = (name: string) => string | undefined

const resolveSub = (text: string, variables: Record<string, unknown>, ref: RefResolver): string =>
  text.replaceAll(/\$\{([\w:.]+)\}/g, (_, name: string) => {
    const value = name in variables ? resolveIntrinsics(variables[name], ref) : ref(name)
    if (typeof value !== 'string') throw new Error(`\${${name}} does not resolve`)
    return value
  })

const resolveOne = (name: string, argument: unknown, ref: RefResolver): unknown => {
  if (name === 'Ref' || name === 'GetAtt') {
    const target = typeof argument === 'string' ? argument : JSON.stringify(argument)
    const value = ref(target)
    if (value === undefined) throw new Error(`!${name} ${target} does not resolve`)
    return value
  }
  if (name === 'Sub') {
    if (typeof argument === 'string') return resolveSub(argument, {}, ref)
    if (Array.isArray(argument) && typeof argument[0] === 'string' && isRecord(argument[1])) {
      return resolveSub(argument[0], argument[1], ref)
    }
  }
  if (name === 'Join' && Array.isArray(argument) && typeof argument[0] === 'string' && Array.isArray(argument[1])) {
    const separator = argument[0]
    return argument[1].map((part) => resolveIntrinsics(part, ref)).join(separator)
  }
  throw new Error(`!${name} ${JSON.stringify(argument)} is not an intrinsic this resolver handles`)
}

/**
 * The value with its `!Ref`, `!GetAtt`, `!Sub` and `!Join` replaced by what they resolve to, in a
 * template parsed with `parseTaggedTemplate`. Throws on an intrinsic it cannot resolve, so a check
 * built on it never passes on a value it did not understand.
 */
export const resolveIntrinsics = (value: unknown, ref: RefResolver): unknown => {
  if (Array.isArray(value)) return value.map((item) => resolveIntrinsics(item, ref))
  if (!isRecord(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 1 && INTRINSICS.includes(keys[0])) return resolveOne(keys[0], value[keys[0]], ref)
  return Object.fromEntries(keys.map((key) => [key, resolveIntrinsics(value[key], ref)]))
}
