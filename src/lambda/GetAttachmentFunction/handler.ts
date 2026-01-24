import type { Readable } from 'node:stream'
import type { StreamingBlobTypes } from '@smithy/types'
import { downloadFile } from '../lib/file'
import { allowOrigin, getParam, LambdaError, lambda } from '../lib/lambda'

const streamToBase64 = async (stream: StreamingBlobTypes): Promise<string> => {
  // In Node.js environment, StreamingBlobTypes is a Readable stream
  const readableStream = stream as Readable
  const chunks: Buffer[] = []
  for await (const chunk of readableStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('base64')
}

const getAttachmentLambda = lambda('getAttachment', async (event) => {
  const data = await downloadFile(getParam(event, 'key'))

  if (!data.Body) {
    throw new LambdaError(404, 'not found')
  }
  const base64Body = await streamToBase64(data.Body)

  const dl = event.queryStringParameters && 'dl' in event.queryStringParameters
  const fileName = getParam(event, 'name', 'kutsu.pdf')
  const params = `filename="${fileName.replaceAll(/[^a-zA-Z0-9]/g, '')}"; filename*=utf-8''${encodeURIComponent(fileName)}`
  const disposition = dl ? 'attachment' : 'inline'
  const dispositionWithParams = `${disposition}; ${params}`

  return {
    body: base64Body,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin(event),
      'Content-Disposition': `${dispositionWithParams}`,
      'Content-Type': 'application/pdf',
    },
    isBase64Encoded: true,
    statusCode: 200,
  }
})

export default getAttachmentLambda
