import { Template } from 'aws-sdk/clients/ses'
import { Root } from 'mdast'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import { Plugin, unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

import { linkHandler } from './mdast2hast/link'
import { tableHandler } from './mdast2hast/table'
import { linkAsText } from './mdast2text/link'
import { remarkPlainText } from './mdast2text/remarkPlainText'
import { removeTableHead } from './mdast2text/table'


export async function markdownToTemplate(templateName: string, source: string): Promise<Template> {
  let subject = ''
  const extractSubject: Plugin<void[], string, Root> = () => (tree: any) => visit(tree, (node, index, parent) => {
    if (subject === '' && node.type === 'definition') {
      subject = node.title
      parent.children.splice(index, 1)
      return [SKIP, index]
    }
  })

  const text = await unified()
    .use(remarkParse)
    .use(extractSubject)
    .use(remarkGfm)
    .use(removeTableHead)
    .use(linkAsText)
    .use(remarkPlainText)
    .process(source)

  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkHtml, { handlers: { table: tableHandler, link: linkHandler } })
    .process(source)

  return {
    TemplateName: templateName,
    SubjectPart: subject,
    TextPart: String(text),
    HtmlPart: String(html),
  }
}

