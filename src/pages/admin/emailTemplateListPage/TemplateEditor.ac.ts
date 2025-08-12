import { closeCompletion, type Completion, type CompletionContext, startCompletion } from '@codemirror/autocomplete'
import { EditorSelection } from '@uiw/react-codemirror'

import { getChild } from './TemplateEditor.utils'

const mustacheStart = (ctx: CompletionContext) => {
  const from = Math.max(0, ctx.pos - 500)
  const text = ctx.state.sliceDoc(from, ctx.pos)
  const open = Math.max(text.lastIndexOf('{{'), text.lastIndexOf('{{{'))
  const close = Math.max(text.lastIndexOf('}}'), text.lastIndexOf('}}}'))
  return open > close ? from + open : -1
}

const createOption = (parent: any, key: string): Completion => {
  const val = parent[key]
  const isObj = val && typeof val === 'object'
  const insert = isObj ? key + '.' : key

  return {
    label: key,
    type: isObj ? 'property' : 'variable',
    detail: isObj ? '…' : String(val),
    apply: (view, _c, fromPos, toPos) => {
      // Replace [fromPos, toPos) and move the caret to the end of the inserted text
      view.dispatch({
        changes: { from: fromPos, to: toPos, insert },
        selection: EditorSelection.cursor(fromPos + insert.length),
        userEvent: 'input.complete',
      })

      // Kill the old list, then reopen a fresh one (so children show immediately after "event.")
      closeCompletion(view)
      if (isObj) {
        queueMicrotask(() => startCompletion(view))
      }
    },
  }
}

export const getAutocomplete = (schema: object) => (ctx: CompletionContext) => {
  const start = mustacheStart(ctx)
  if (start < 0) return null

  // Text typed inside the current mustache
  const typed = ctx.state.sliceDoc(start, ctx.pos)
  // Capture the trailing identifier path (letters/digits/_/.$) up to the cursor.
  const m = /[^\w.$]([\w.$]*)$/.exec(typed)
  const id = m ? m[1] : ''

  // If it ends with a dot, we’re completing children of that path
  const hasTrailingDot = id.endsWith('.')
  const basePath = hasTrailingDot ? id.slice(0, -1) : id

  const parts = basePath.split('.').filter(Boolean)
  const parentPath = hasTrailingDot ? parts : parts.slice(0, -1)
  const lastToken = hasTrailingDot ? '' : (parts[parts.length - 1] ?? '')

  const parent = parentPath.length ? getChild(schema, parentPath) : schema
  if (!parent || typeof parent !== 'object') return null

  // When nothing is typed (top-level) or after a dot, start insertion *here*
  const from = hasTrailingDot || !lastToken ? ctx.pos : ctx.pos - lastToken.length

  const options: Completion[] = Object.keys(parent).map((key) => createOption(parent, key))

  return {
    from,
    options,
    validFor: /^[A-Za-z0-9_$]*$/,
  }
}
