import Handlebars from 'handlebars'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import { Processor, unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'
import { reporter } from 'vfile-reporter'

import link from './handlers/link'
import tableHandler from './handlers/table'

interface Node {
  type: string
  value: any
  children: any
}

export async function genJson(templateName: string, source: string) {
  let subject = ''
  const extractSubject = () => (tree: any) => visit(tree, (node, index, parent) => {
    if (subject === '' && node.type === 'definition') {
      subject = node.title
      parent.children.splice(index, 1)
      return [SKIP, index]
    }
  })

  const removeTableHead = () => (tree: any) => visit(tree, (node, index, parent) => {
    if (node.type === 'tableRow' && index === 0 && !parent.headSkipped) {
      parent.children.splice(index, 1)
      parent.headSkipped = true
      return [SKIP, index]
    }
  })

  const linkAsText = () => (tree: any) => visit(tree, (node) => {
    if (node.type === 'link') {
      node.children[0].value += ': ' + node.url
    }
  })

  const text = await unified()
    .use(remarkParse)
    .use(extractSubject)
    .use(remarkGfm as any)
    .use(removeTableHead)
    .use(linkAsText)
    .use(remarkPlainText)
    .process(source)

  console.error(reporter(text))
  Handlebars.precompile(String(text), { strict: true })

  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkHtml, { handlers: { table: tableHandler, link } })
    .process(source)

  return {
    TemplateName: templateName,
    SubjectPart: subject,
    TextPart: String(text),
    HtmlPart: String(html),
  }
}
function remarkPlainText(this: Processor) {
  Object.assign(this, { Compiler: compiler })

  function compiler(node: Node, file: { extname: string }) {
    const result = toPlainText(node)

    if (file.extname) {
      file.extname = '.txt'
    }

    // Add an eof eol.
    return node &&
      node.type &&
      node.type === 'root' &&
      result &&
      /[^\r\n]/.test(result.charAt(result.length - 1))
      ? result + '\n'
      : result
  }
}
function toPlainText(node: Node) {
  return one(node)
}
function one(node: Node): string {
  //console.warn(node);
  return (
    (node &&
      typeof node === 'object' &&
      ((node.value && formatValue(node)) ||
        ('children' in node && all(node.type, node.children)) ||
        (Array.isArray(node) && all('array', node)))) ||
    ''
  )
}
function formatValue(node: { value: string }) {
  if (node.value.endsWith(':')) {
    return node.value + ' '
  }
  return node.value
}
function all(type: string, values: Node[]) {
  /** @type {Array.<string>} */
  const result = []
  let index = -1

  while (++index < values.length) {
    result[index] = one(values[index])
  }

  if (type === 'tableRow' || type === 'table') {
    result.push("\n")
  }
  if (type === 'paragraph' || type === 'heading') {
    result.push("\n\n")
  }

  return result.join('')
}
