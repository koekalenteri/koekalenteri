import { downloadFile } from '../lib/file'
import { getParam, lambda, LambdaError } from '../lib/lambda'
import { allowOrigin } from '../utils/response'

const getAttachmentLambda = lambda('getAttachment', async (event) => {
  const data = await downloadFile(getParam(event, 'key'))

  if (!data.Body) {
    throw new LambdaError(404, 'not found')
  }
  const dl = event.queryStringParameters && 'dl' in event.queryStringParameters
  const fileName = getParam(event, 'name', 'kutsu.pdf')
  const params = `filename="${fileName.replace(/[^a-zA-Z0-9]/g, '')}"; filename*=utf-8''${encodeURIComponent(fileName)}`
  const disposition = dl ? 'attachment' : 'inline'
  const dispositionWithParams = `${disposition}; ${params}`

  return {
    statusCode: 200,
    body: data.Body.toString('base64'),
    isBase64Encoded: true,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin(event),
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${dispositionWithParams}`,
    },
  }
})

export default getAttachmentLambda
