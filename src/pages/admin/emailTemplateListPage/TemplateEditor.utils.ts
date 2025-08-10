type Schema = Record<string, any>

export const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object'

export const elemOf = (v: any) => (Array.isArray(v) ? v[0] : isObj(v) && v.__array ? v.__array : undefined)

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

/** Very light parser: build a stack of #each scopes up to `pos` */
function buildEachScopes(doc: string, pos: number, root: Schema): EachScope[] {
  const scopes: EachScope[] = [{ base: root }]
  const tagRe = /{{{?([^}]*)}}}?/g
  let m: RegExpExecArray | null
  while ((m = tagRe.exec(doc))) {
    const start = m.index
    const full = m[1].trim()
    if (start >= pos) break

    // close?
    if (/^\/\s*each\b/.test(full)) {
      if (scopes.length > 1) scopes.pop()
      continue
    }

    // open?
    const eachOpen = /^#\s*each\b([\s\S]*)/.exec(full)
    if (!eachOpen) continue

    // Extract path and optional block params:  #each path  or  #each path as |item idx|
    const rest = eachOpen[1]
    // split before "as |...|"
    const asMatch = /\bas\s*\|\s*([^|]+)\s*\|/.exec(rest)
    const beforeAs = asMatch ? rest.slice(0, asMatch.index).trim() : rest.trim()

    // path parts (respect ../ segments)
    const path = beforeAs.split(/\s+/)[0] || 'this'
    const rawParts = path.split('.').filter(Boolean)

    // Resolve relative to current top scope
    const curBase: any = scopes[scopes.length - 1].base
    let i = 0
    // handle leading ../
    while (rawParts[i] === '..') {
      if (scopes.length > 1) scopes.pop()
      i++
    }
    // start from either alias/this/top
    let startBase = curBase
    const parts = rawParts.slice(i)
    if (parts[0] === 'this') parts.shift()
    else if (
      parts[0] &&
      scopes
        .slice()
        .reverse()
        .some((s) => s.alias === parts[0])
    ) {
      // if path starts with a visible alias, switch to that alias' base
      const s = scopes
        .slice()
        .reverse()
        .find((s) => s.alias === parts[0])!
      startBase = s.base
      parts.shift()
    }

    const iterTarget = parts.length ? getChild(startBase, parts) : startBase
    const itemType = elemOf(iterTarget)
    const aliasList = (asMatch?.[1] ?? '').split(/\s+/).filter(Boolean)
    const [alias, indexAlias] = aliasList

    if (itemType !== undefined) {
      scopes.push({ base: itemType, alias, indexAlias })
    } else {
      // unknown or non-array → still push something so ../ will pop correctly
      scopes.push({ base: {}, alias, indexAlias })
    }
  }
  return scopes
}

/** Resolve an identifier path at `pos` into a parent object to complete under */
export function resolveForCompletion(doc: string, pos: number, root: Schema, idText: string) {
  const scopes = buildEachScopes(doc, pos, root)
  const current = scopes[scopes.length - 1]
  // Allow alias/this/../ and bare names (bare names → current base)
  const parts = idText.split('.').filter(Boolean)
  let base = current.base
  let i = 0

  // climb with ../
  while (parts[i] === '..') {
    if (scopes.length > 1) scopes.pop()
    i++
  }
  const scopeNow = scopes[scopes.length - 1]

  // switch base on alias
  if (parts[i] && scopeNow && scopeNow.alias === parts[i]) {
    base = scopeNow.base
    i++
  } else if (parts[i] === 'this') {
    base = scopeNow.base
    i++
  } else if (
    parts[i] &&
    scopes
      .slice(0, -1)
      .reverse()
      .some((s) => s.alias === parts[i])
  ) {
    const s = scopes
      .slice(0, -1)
      .reverse()
      .find((s) => s.alias === parts[i])!
    base = s.base
    i++
  } else if (parts.length && parts[0] in root) {
    // explicit root reference (e.g. event.name)
    base = root // leave full parts
  } else {
    // bare name inside each → start from current base
  }

  const parentPath = parts.slice(0, Math.max(0, parts.length - 1)).slice(i)
  const parent = parentPath.length ? getChild(base, parentPath) : base
  const lastToken = parts[parts.length - 1] ?? ''

  return { parent, lastToken, scopes, current }
}

export function resolveScopeBaseForPath(doc: string, pos: number, root: Schema, id: string) {
  const scopes = buildEachScopes(doc, pos, root)
  const parts = id.split('.').filter(Boolean)
  let i = 0

  // climb with ../
  while (parts[i] === '..') {
    if (scopes.length > 1) scopes.pop()
    i++
  }

  let base = scopes[scopes.length - 1].base

  // alias / this / outer alias
  const aliasHere = scopes[scopes.length - 1].alias
  if (parts[i] === 'this') {
    i++
  } else if (aliasHere && parts[i] === aliasHere) {
    base = scopes[scopes.length - 1].base
    i++
  } else {
    const outer = scopes
      .slice(0, -1)
      .reverse()
      .find((s) => s.alias === parts[i])
    if (outer) {
      base = outer.base
      i++
    } else if (parts[i] && parts[i] in root) {
      // explicit root reference like "reg.owner.name":
      // start from ROOT but do NOT consume the first segment (i stays as-is)
      base = root
    }
  }

  return { base, parts, start: i }
}
