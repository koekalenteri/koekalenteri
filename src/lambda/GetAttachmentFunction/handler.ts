import type { Readable } from 'node:stream'
import type { StreamingBlobTypes } from '@smithy/types'
import { downloadFile } from '../lib/file'
import { allowOrigin, getParam, lambda } from '../lib/lambda'

const ATTACHMENT_NOT_FOUND_MESSAGE =
  'Koekutsun liitetiedostoa ei enää löydy. Kokeen järjestäjä on saattanut päivittää tiedoston kutsun lähettämisen jälkeen. Pyydä tarvittaessa järjestäjältä uusi kutsu.'

const isNotFoundError = (error: unknown): boolean => {
  const fileError = error as { $metadata?: { httpStatusCode?: number }; name?: string }
  return fileError?.name === 'NoSuchKey' || fileError?.$metadata?.httpStatusCode === 404
}

const notFoundResponse = (event: Parameters<typeof allowOrigin>[0]) => ({
  body: ATTACHMENT_NOT_FOUND_MESSAGE,
  headers: {
    'Access-Control-Allow-Origin': allowOrigin(event),
    'Content-Type': 'text/plain; charset=utf-8',
  },
  statusCode: 404,
})

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
  let data: Awaited<ReturnType<typeof downloadFile>>
  try {
    data = await downloadFile(getParam(event, 'key'))
  } catch (error) {
    if (isNotFoundError(error)) {
      return notFoundResponse(event)
    }
    throw error
  }

  if (!data.Body) {
    return notFoundResponse(event)
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
