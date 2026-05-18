import { authorize } from '../auth/api'
import { emailTemplateRepository } from '../emailTemplate/repository'
import { lambda, response } from '../lib/lambda'

export const getEmailTemplatesLambda = async (event: APIGatewayProxyEvent) => {
  const user = await authorize(event)
  if (!user) {
    return response(401, 'Unauthorized', event)
  }

  const items = await emailTemplateRepository.readAll()

  return response(200, items, event)
}

export default lambda('getEmailTemplates', getEmailTemplatesLambda)

import type { APIGatewayProxyEvent } from 'aws-lambda'
