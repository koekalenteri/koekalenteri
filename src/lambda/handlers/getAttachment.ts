import { downloadFile } from '../lib/file'
import { getParam, lambda, LambdaError } from '../lib/lambda'
import { allowOrigin } from '../utils/response'

const getAttachmentLambda = lambda('getAttachment', async (event) => {
  const data = await downloadFile(getParam(event, 'key'))

  if (!data.Body) {
    throw new LambdaError(404, 'not found')
  }
  const dl = event.queryStringParameters && 'dl' in event.queryStringParameters
  const disposition = dl ? `attachment; filename="${getParam(event, 'name', 'kutsu.pdf')}"` : 'inline'

  return {
    statusCode: 200,
    body: data.Body.toString('base64'),
    isBase64Encoded: true,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin(event),
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}`,
    },
  }
})

export default getAttachmentLambda
