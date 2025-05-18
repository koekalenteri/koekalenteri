import { Readable } from 'stream'

import { downloadFile } from '../lib/file'
import { getParam, lambda, LambdaError } from '../lib/lambda'
import { allowOrigin } from '../utils/response'

const readableStreamToNodeReadable = (readableStream: ReadableStream<any>): Readable => {
  const reader = readableStream.getReader()
  return new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) this.push(null)
      else this.push(Buffer.from(value))
    },
  })
}

const streamToBase64 = async (stream: Readable): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('base64')
}

const getAttachmentLambda = lambda('getAttachment', async (event) => {
  const data = await downloadFile(getParam(event, 'key'))

  if (!data.Body) {
    throw new LambdaError(404, 'not found')
  }
  const nodeReadable = readableStreamToNodeReadable(data.Body as ReadableStream<any>)
  const base64Body = await streamToBase64(nodeReadable)

  const dl = event.queryStringParameters && 'dl' in event.queryStringParameters
  const fileName = getParam(event, 'name', 'kutsu.pdf')
  const params = `filename="${fileName.replace(/[^a-zA-Z0-9]/g, '')}"; filename*=utf-8''${encodeURIComponent(fileName)}`
  const disposition = dl ? 'attachment' : 'inline'
  const dispositionWithParams = `${disposition}; ${params}`

  return {
    statusCode: 200,
    body: base64Body,
    isBase64Encoded: true,
    headers: {
      'Access-Control-Allow-Origin': allowOrigin(event),
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${dispositionWithParams}`,
    },
  }
})

export default getAttachmentLambda
