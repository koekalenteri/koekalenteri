import type { Diagnostic, LintSource } from '@codemirror/lint'
import { EditorSelection } from '@uiw/react-codemirror'
import { elemOf, isObj, resolveForCompletion, resolveScopeBaseForPath } from './TemplateEditor.utils'

const HELPERS = new Set(['if', 'unless', 'each', 'else'])

const mustacheRe = /{{{?([^{}]*?)}}}?/g // naive but effective for linting
const identPathRe = /\b[A-Za-z_@][\w$]*(?:\.[A-Za-z_][\w$]*)*\b/g

type PathValidation = { ok: true } | { ok: false; badIdx: number }

function validatePath(base: any, parts: string[], start: number): PathValidation {
  let cur: any = base
  for (let j = start; j < parts.length; j++) {
    const seg = parts[j]
    if (seg === 'this' || seg === '..') continue
    if (!isObj(cur) || !(seg in cur)) return { badIdx: j, ok: false }
    cur = (cur as any)[seg]
    const el = elemOf(cur)
    if (el !== undefined) cur = el
  }
  return { ok: true }
}

function computeSegmentRange(innerStart: number, idmIndex: number, parts: string[], badIdx: number) {
  const before = parts.slice(0, badIdx).join('.')
  const segOffset = before ? before.length + 1 : 0
  const segStart = innerStart + idmIndex + segOffset
  const segEnd = segStart + parts[badIdx].length
  return { segEnd, segStart }
}

function getSuggestKeys(base: any, parts: string[], start: number, upToExclusive: number): string[] {
  let p: any = base
  for (let k = start; k < upToExclusive; k++) {
    const s = parts[k]
    if (s === 'this' || s === '..') continue
    const next = p?.[s]
    p = Array.isArray(next) ? (elemOf(next) ?? next) : next
  }
  return isObj(p) ? Object.keys(p) : []
}

export const getLintSource =
  (schema: object): LintSource =>
  (view) => {
    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc.toString()

    for (const m of doc.matchAll(mustacheRe)) {
      const inner = m[1]
      const innerStart = m.index + (m[0].startsWith('{{{') ? 3 : 2)
      const stripped = inner.replace(/"(?:\\.|[^"]*)"|'(?:\\.|[^']*)'/g, (s) => ' '.repeat(s.length))

      for (const idm of stripped.matchAll(identPathRe)) {
        const full = idm[0]
        if (HELPERS.has(full) || full.startsWith('@')) continue

        const pos = innerStart + idm.index
        const { parent } = resolveForCompletion(doc, pos, schema, full)
        if (!parent || !isObj(parent)) continue

        const { base, parts, start } = resolveScopeBaseForPath(doc, pos, schema, full)

        const validation = validatePath(base, parts, start)
        if (validation.ok) continue

        const badIdx = validation.badIdx
        const { segStart, segEnd } = computeSegmentRange(innerStart, idm.index, parts, badIdx)
        const suggestFrom = getSuggestKeys(base, parts, start, badIdx)

        diagnostics.push({
          actions: suggestFrom.slice(0, 3).map((k) => ({
            apply(v) {
              v.dispatch({
                changes: { from: segStart, insert: k, to: segEnd },
                selection: EditorSelection.cursor(segStart + k.length),
                userEvent: 'input.replace',
              })
            },
            name: `Replace with "${k}"`,
          })),
          from: segStart,
          message: `Unknown "${parts[badIdx]}" here.`,
          severity: 'warning',
          to: segEnd,
        })
      }
    }
    return diagnostics
  }
