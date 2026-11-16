import type { EmailTemplateDefaults } from '../emailTemplate'

/**
 * The default content of each template that has one, imported from its `<id>.fi.ts` and
 * `<id>.en.ts` beside this file. The deploy writes a default into an environment whose table holds
 * no row for its id, and never touches a row that is there (README.md, KOE-1363).
 */
export const EMAIL_TEMPLATE_DEFAULTS: EmailTemplateDefaults = {}
