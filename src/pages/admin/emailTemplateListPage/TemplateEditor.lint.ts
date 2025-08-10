import type { Diagnostic, LintSource } from '@codemirror/lint'

import { EditorSelection } from '@uiw/react-codemirror'

import { elemOf, isObj, resolveForCompletion, resolveScopeBaseForPath } from './TemplateEditor.utils'

const HELPERS = new Set(['if', 'unless', 'each', 'else'])

const mustacheRe = /{{{?([^{}]*?)}}}?/g // naive but effective for linting
const identPathRe = /\b[A-Za-z_@][\w$]*(?:\.[A-Za-z_][\w$]*)*\b/g

export const getLintSource =
  (schema: object): LintSource =>
  (view) => {
    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc.toString()

    for (let m; (m = mustacheRe.exec(doc)); ) {
      const inner = m[1]
      const innerStart = m.index + (m[0].startsWith('{{{') ? 3 : 2)
      const stripped = inner.replace(/"(?:\\.|[^"]*)"|'(?:\\.|[^']*)'/g, (s) => ' '.repeat(s.length))

      for (let idm; (idm = identPathRe.exec(stripped)); ) {
        const full = idm[0]
        if (HELPERS.has(full) || full.startsWith('@')) continue

        const { parent } = resolveForCompletion(doc, innerStart + idm.index, schema, full)
        if (!parent || !isObj(parent)) continue

        const { base, parts, start } = resolveScopeBaseForPath(doc, innerStart + idm.index, schema, full)

        let cur: any = base
        let badIdx = -1

        for (let j = start; j < parts.length; j++) {
          const seg = parts[j]
          if (seg === 'this' || seg === '..') continue

          if (!isObj(cur) || !(seg in cur)) {
            badIdx = j
            break
          }

          cur = (cur as any)[seg]
          const el = elemOf(cur)
          if (el !== undefined) cur = el // drill into array element type if needed
        }

        if (badIdx === -1) continue // path is valid

        // compute highlight range for the bad segment
        const before = parts.slice(0, badIdx).join('.')
        const segOffset = before ? before.length + 1 : 0
        const segStart = innerStart + idm.index + segOffset
        const segEnd = segStart + parts[badIdx].length

        // suggestions from the keys of the object we were trying to read
        const suggestFrom = ((j) => {
          // walk again up to j-1 to get the parent we failed on
          let p: any = base
          for (let k = start; k < j; k++) {
            const s = parts[k]
            if (s === 'this' || s === '..') continue
            p = Array.isArray(p?.[s]) ? (elemOf(p[s]) ?? p[s]) : p?.[s]
          }
          return isObj(p) ? Object.keys(p) : []
        })(badIdx)

        diagnostics.push({
          from: segStart,
          to: segEnd,
          severity: 'warning',
          message: `Unknown "${parts[badIdx]}" here.`,
          actions: suggestFrom.slice(0, 3).map((k) => ({
            name: `Replace with "${k}"`,
            apply(v) {
              v.dispatch({
                changes: { from: segStart, to: segEnd, insert: k },
                selection: EditorSelection.cursor(segStart + k.length),
                userEvent: 'input.replace',
              })
            },
          })),
        })
      }
    }
    return diagnostics
  }
