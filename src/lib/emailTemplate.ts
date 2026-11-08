import type { EmailTemplate, EmailTemplateContent, EmailTemplateError, TemplateSyntaxError } from '../types'
import Handlebars from 'handlebars/dist/cjs/handlebars.js'
import { LANGUAGES } from '../types'

/**
 * A mismatched block ("if doesn't match each - 3:7") carries its position on the exception; the
 * parser only says it in the message, and the position is repeated there.
 */
interface LocatedException {
  lineNumber?: unknown
  column?: unknown
  endColumn?: unknown
  message?: unknown
}

const parseErrorRe = /^Parse error on line (\d+):\n[\s\S]*\n(Expecting .*)$/
const positionSuffixRe = / - \d+:\d+$/

/**
 * The parser names the token it choked on by its grammar name. The ones a template author actually
 * runs into are said in words; anything else keeps the parser's own line.
 */
const explainParseError = (expecting: string): string => {
  if (expecting.endsWith("got 'EOF'")) return 'The template ends before a {{ }} or a block is closed'
  if (expecting.endsWith("got 'OPEN_ENDBLOCK'")) return 'A closing {{/…}} without a block to close'
  if (expecting.endsWith("got 'INVALID'")) return 'Unexpected character inside {{ }}'
  if (expecting.endsWith("got 'CLOSE_UNESCAPED'")) return 'Too many closing braces'
  return expecting
}

const isNumber = (value: unknown): value is number => typeof value === 'number'

const describe = (e: unknown): TemplateSyntaxError => {
  const located: LocatedException = typeof e === 'object' && e !== null ? e : {}
  const message = typeof located.message === 'string' ? located.message : 'Invalid template'

  if (isNumber(located.lineNumber)) {
    return {
      column: isNumber(located.column) ? located.column : undefined,
      endColumn: isNumber(located.endColumn) ? located.endColumn : undefined,
      line: located.lineNumber,
      message: message.replace(positionSuffixRe, ''),
    }
  }

  const parsed = parseErrorRe.exec(message)
  if (parsed) return { line: Number(parsed[1]), message: explainParseError(parsed[2]) }

  return { line: 1, message }
}

/**
 * Where Handlebars stops on a template's source, or nothing when it parses. This is the check the
 * editor runs as you type and the server runs before it touches SES, because SES itself only ever
 * says "Handlebars compilation failed for input Template Content" (KOE-1434).
 */
export const findTemplateSyntaxError = (source: string): TemplateSyntaxError | undefined => {
  try {
    Handlebars.parse(source)
    return undefined
  } catch (e) {
    return describe(e)
  }
}

/** The first language whose source does not parse, Finnish before English, or nothing when both do. */
export const findEmailTemplateError = (template: Pick<EmailTemplate, 'fi' | 'en'>): EmailTemplateError | undefined => {
  for (const language of LANGUAGES) {
    const error = findTemplateSyntaxError(template[language])
    if (error) return { ...error, language }
  }
  return undefined
}

/**
 * What compiling and rendering the SES parts on empty data has to say, when SES has rejected a
 * template whose source parses: "#if requires exactly one argument" or 'Missing helper: "foo"',
 * where SES said nothing. Nothing when every part renders; the rejection is then SES's to explain.
 */
export const explainTemplateRejection = (template: EmailTemplateContent): string | undefined => {
  for (const part of [template.SubjectPart, template.TextPart, template.HtmlPart]) {
    if (part === undefined) continue
    try {
      Handlebars.compile(part)({})
    } catch (e) {
      return e instanceof Error ? e.message : 'Invalid template'
    }
  }
  return undefined
}
