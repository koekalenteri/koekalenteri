import { CONFIG } from '../config'
import { authorize } from '../lib/auth'
import { lambda } from '../lib/lambda'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { response } from '../utils/response'

const dynamoDB = new CustomDynamoClient(CONFIG.emailTemplateTable)

const getEmailTemplatesLambda = lambda('getEmailTemplates', async (event) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const items = await dynamoDB.readAll()

  return response(200, items, event)
})

export default getEmailTemplatesLambda
