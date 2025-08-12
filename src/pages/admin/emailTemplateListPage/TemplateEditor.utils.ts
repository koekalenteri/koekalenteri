type Schema = Record<string, any>

export const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'

export const elemOf = (v: any) => {
  if (Array.isArray(v)) {
    return v[0]
  }
  if (isObj(v) && v.__array) {
    return v.__array
  }
}

export function getChild(obj: any, parts: string[]) {
  let cur = obj
  for (const p of parts) {
    if (!isObj(cur)) return undefined
    cur = (cur as any)[p]
    if (cur === undefined) return undefined
  }
  return cur
}

type EachScope = {
  /** current implicit context (“this”) */
  base: any
  /** optional alias from `as |alias|` */
  alias?: string
  /** optional second alias (index/key) from `as |value idx|` */
  indexAlias?: string
}

const isCloseEach = (full: string) => /^\/\s*each\b/.test(full)
const parseOpenEach = (full: string) => /^#\s*each\b([\s\S]*)/.exec(full)
const parseAsBlock = (rest: string) => {
  const asMatch = /\bas\s+\|\s?([^|]+)\|/u.exec(rest)
  const beforeAs = asMatch ? rest.slice(0, asMatch.index).trim() : rest.trim()
  const aliasList = (asMatch?.[1] ?? '').split(/\s+/).filter(Boolean)
  return { beforeAs, aliasList }
}

const resolveStartBaseAndParts = (raw: string, allScopes: EachScope[]) => {
  const rawParts = raw.split('.').filter(Boolean)
  // handle leading ../ by popping scopes, but keep the root
  const scopeStack = allScopes
  let i = 0
  while (rawParts[i] === '..') {
    if (scopeStack.length > 1) scopeStack.pop()
    i++
  }
  let startBase = scopeStack[scopeStack.length - 1].base
  const parts = rawParts.slice(i)

  if (parts[0] === 'this') {
    parts.shift()
    return { startBase, parts }
  }

  // If first segment equals any visible alias, switch to that base and consume it
  const aliasOwner = parts[0] && [...scopeStack].reverse().find((s) => s.alias === parts[0])
  if (aliasOwner) {
    startBase = aliasOwner.base
    parts.shift()
  }
  return { startBase, parts }
}

/** Very light parser: build a stack of #each scopes up to `pos` */
function buildEachScopes(doc: string, pos: number, root: Schema): EachScope[] {
  const scopes: EachScope[] = [{ base: root }]
  const tagRe = /{{{?([^{}]*)}}}?/g

  const pushScopeFromPath = (startBase: any, parts: string[], alias?: string, indexAlias?: string) => {
    const iterTarget = parts.length ? getChild(startBase, parts) : startBase
    const itemType = elemOf(iterTarget)
    const base = itemType !== undefined ? itemType : {}
    scopes.push({ base, alias, indexAlias })
  }

  let m: RegExpExecArray | null
  while ((m = tagRe.exec(doc))) {
    const start = m.index
    const full = m[1].trim()
    if (start >= pos) break

    if (isCloseEach(full)) {
      if (scopes.length > 1) scopes.pop()
      continue
    }

    const eachOpen = parseOpenEach(full)
    if (!eachOpen) continue

    const rest = eachOpen[1]
    const { beforeAs, aliasList } = parseAsBlock(rest)
    const path = (beforeAs.split(/\s+/)[0] || 'this').trim()

    const { startBase, parts } = resolveStartBaseAndParts(path, scopes)
    const [alias, indexAlias] = aliasList
    pushScopeFromPath(startBase, parts, alias, indexAlias)
  }
  return scopes
}

/** Resolve an identifier path at `pos` into a parent object to complete under */
export function resolveForCompletion(doc: string, pos: number, root: Schema, idText: string) {
  const scopes = buildEachScopes(doc, pos, root)
  const current = scopes[scopes.length - 1]

  // Normalize and resolve base/parts using common helper to avoid duplication
  const { startBase, parts } = resolveStartBaseAndParts(idText, scopes)

  // Determine the parent object for completion (all but the last token)
  const parentPath = parts.slice(0, Math.max(0, parts.length - 1))
  const parent = parentPath.length ? getChild(startBase, parentPath) : startBase
  const lastToken = parts[parts.length - 1] ?? ''

  return { parent, lastToken, scopes, current }
}

export function resolveScopeBaseForPath(doc: string, pos: number, root: Schema, id: string) {
  const scopes = buildEachScopes(doc, pos, root)
  // Use shared resolver to unify alias/this/../ handling
  const { startBase, parts } = resolveStartBaseAndParts(id, scopes)

  // In the old API we also returned the index from which unresolved parts start.
  // With resolveStartBaseAndParts we have already consumed alias/this/../ at the front
  // so the unresolved path always starts at 0 now.
  const base = startBase
  const start = 0

  return { base, parts, start }
}
