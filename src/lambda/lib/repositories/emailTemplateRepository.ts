import type { JsonEmailTemplate } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'
import { isConditionalCheckFailure } from '../api-gw'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)

/** Every email template the table holds. */
export const readEmailTemplates = async () => dynamoDB.readAll<JsonEmailTemplate>()

/** The template by its id, or undefined for one the table does not hold yet. */
export const readEmailTemplate = async (id: string) => dynamoDB.read<JsonEmailTemplate>({ id })

/** Stores the template, replacing what the table held for its id. */
export const writeEmailTemplate = async (template: JsonEmailTemplate) => {
  await dynamoDB.write(template)
}

/**
 * Stores the template only if the table holds no row for its id, and answers whether it did: a row
 * an organizer saved in the meantime is never replaced (the deploy's seeding, KOE-1363).
 */
export const writeNewEmailTemplate = async (template: JsonEmailTemplate): Promise<boolean> => {
  try {
    await dynamoDB.write(template, { expression: 'attribute_not_exists(#id)', names: { '#id': 'id' } })
    return true
  } catch (error) {
    if (!isConditionalCheckFailure(error)) throw error
    return false
  }
}
