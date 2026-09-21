import type { EmailTemplate, EmailTemplateError, Language } from '@/types'
import i18next from 'i18next'
import { useAtom, useAtomValue } from 'jotai'
import { putEmailTemplate } from '@/api/email'
import { APIError } from '@/api/http'
import { isObject } from '@/lib/utils'
import { validIdTokenAtom } from '@/pages/state'
import { LANGUAGES } from '@/types'
import { adminEmailTemplatesAtom } from './atoms'

type EmailTemplateSaveResult = { ok: true } | { ok: false; error: EmailTemplateError }

const languages: ReadonlySet<unknown> = new Set(LANGUAGES)
const isLanguage = (value: unknown): value is Language => languages.has(value)
const numberOrNothing = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)

/**
 * The failure as the editor shows it. A 400 from the server carries the language and line it
 * stopped on; any other answer is shown in its own words, and a failure with no words at all gets
 * the general one (KOE-1434).
 */
const saveError = (e: unknown): EmailTemplateError => {
  if (e instanceof APIError) {
    const { body } = e
    if (isObject(body) && typeof body.message === 'string') {
      return {
        column: numberOrNothing(body.column),
        language: isLanguage(body.language) ? body.language : undefined,
        line: numberOrNothing(body.line),
        message: body.message,
      }
    }
    return { message: typeof body === 'string' && body ? body : e.message }
  }
  return { message: e instanceof Error ? e.message : i18next.t('error.somethingWentWrong') }
}

export const useAdminEmailTemplatesActions = () => {
  const token = useAtomValue(validIdTokenAtom)
  const [emailTemplates, setEmailTemplates] = useAtom(adminEmailTemplatesAtom)

  return {
    async save(template: EmailTemplate): Promise<EmailTemplateSaveResult> {
      const templates = [...emailTemplates]
      try {
        if (!token) throw new Error('missing token')
        const saved = await putEmailTemplate(template, token)
        const index = templates.findIndex((i) => i.id === saved.id)
        templates.splice(index, 1, saved)
        setEmailTemplates(templates)
        return { ok: true }
      } catch (e) {
        return { error: saveError(e), ok: false }
      }
    },
  }
}
