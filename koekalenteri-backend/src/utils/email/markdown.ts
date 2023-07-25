/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Template } from 'aws-sdk/clients/ses'
import type { Root } from 'mdast'
import type { Plugin } from 'unified'

import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

import { linkHandler } from './mdast2hast/link'
import { tableHandler } from './mdast2hast/table'
import { linkAsText } from './mdast2text/link'
import { remarkPlainText } from './mdast2text/remarkPlainText'
import { removeTableHead } from './mdast2text/table'

export async function markdownToTemplate(templateName: string, source: string): Promise<Template> {
  const { text, subject } = await markdownToText(source)
  const html = await markdownToHtml(source)

  return {
    TemplateName: templateName,
    SubjectPart: subject,
    TextPart: String(text),
    HtmlPart: String(html),
  }
}

export async function markdownToText(source: string): Promise<{ subject: string; text: string }> {
  let subject = ''
  const extractSubject: Plugin<void[], string, Root> = () => (tree: any) =>
    visit(tree, (node, index, parent) => {
      if (subject === '' && node.type === 'definition' && node.title) {
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

  return { subject, text: String(text) }
}

export async function markdownToHtml(source: string): Promise<string> {
  const html = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkBreaks)
    .use(remarkHtml, { handlers: { table: tableHandler, link: linkHandler } })
    .process(source)

  return String(html)
}
