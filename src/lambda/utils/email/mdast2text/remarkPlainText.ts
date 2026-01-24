import type { Processor } from 'unified'
import type { Node } from 'unist-builder/lib'

import { toPlainText } from './toPlainText'

function compiler(node: Node, file: { extname: string }) {
  const result = toPlainText(node)

  if (file.extname) {
    file.extname = '.txt'
  }

  // Add an eof eol.
  return node?.type === 'root' && result && /[^\r\n]/.test(result.charAt(result.length - 1)) ? result + '\n' : result
}

export function remarkPlainText(this: Processor) {
  Object.assign(this, { Compiler: compiler })
}
