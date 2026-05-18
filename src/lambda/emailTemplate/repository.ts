import type { JsonEmailTemplate } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type EmailTemplateRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'read' | 'readAll' | 'write'>
}

interface EmailTemplateRepository {
  readById(id: string): Promise<JsonEmailTemplate | undefined>
  readAll(): Promise<JsonEmailTemplate[] | undefined>
  write(template: JsonEmailTemplate): Promise<void>
}

const createEmailTemplateRepository = ({ db }: EmailTemplateRepositoryDependencies): EmailTemplateRepository => ({
  async readAll() {
    return db.readAll<JsonEmailTemplate>()
  },
  async readById(id) {
    return db.read<JsonEmailTemplate>({ id })
  },

  async write(template) {
    await db.write(template)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)
export const emailTemplateRepository = createEmailTemplateRepository({ db: dynamoDB })
