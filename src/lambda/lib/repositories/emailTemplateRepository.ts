import type { JsonEmailTemplate } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)

/** Every email template the table holds. */
export const readEmailTemplates = async () => dynamoDB.readAll<JsonEmailTemplate>()

/** The template by its id, or undefined for one the table does not hold yet. */
export const readEmailTemplate = async (id: string) => dynamoDB.read<JsonEmailTemplate>({ id })

/** Stores the template, replacing what the table held for its id. */
export const writeEmailTemplate = async (template: JsonEmailTemplate) => {
  await dynamoDB.write(template)
}
