import type { Readable } from 'node:stream'
import type {
  DeleteObjectCommandInput,
  GetObjectCommandInput,
  GetObjectOutput,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { FileInfo } from 'busboy'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import Busboy from 'busboy'
import { CONFIG } from '../config'

const s3 = new S3Client()
const { fileBucket } = CONFIG

interface ParseResult {
  info?: FileInfo
  data?: Buffer
  fields: Record<string, string>
  error: Error | null
}

export const parsePostFile = (event: APIGatewayProxyEvent) =>
  new Promise<ParseResult>((resolve, reject) => {
    console.log('Parsing File from event...')
    const bb = Busboy({
      headers: {
        'content-type': event.headers['content-type'] ?? event.headers['Content-Type'],
      },
    })
    console.log('busboy initialized')

    const result: ParseResult = {
      data: undefined,
      error: null,
      fields: {},
      info: undefined,
    }
    const buffers: Uint8Array[] = []

    bb.on('file', (_name: string, file: Readable, info: FileInfo): void => {
      file.on('data', (data) => {
        console.log('on data', data.length)
        buffers.push(data)
      })

      file.on('end', () => {
        console.log('on end')
        result.error = file.errored
        result.info = info
        result.data = Buffer.concat(buffers)
      })
    })

    bb.on('field', (name, value) => {
      console.log('on field', name)
      result.fields[name] = value
    })

    bb.on('error', (error) => {
      console.error(error)
      reject(new Error('bb error'))
    })
    bb.on('finish', () => {
      console.log('on finish')
      resolve(result)
    })
    bb.write(event.body, event.isBase64Encoded ? 'base64' : 'binary')
    bb.end()
    console.log('parse end')
  })

export const uploadFile = async (key: string, buffer: PutObjectCommandInput['Body']): Promise<void> => {
  console.log(`Uploading file to S3 bucket "${fileBucket}" with key "${key}"`)
  const params: PutObjectCommandInput = {
    Body: buffer,
    Bucket: fileBucket,
    ContentType: 'application/pdf',
    Key: key,
  }

  try {
    await s3.send(new PutObjectCommand(params))
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const downloadFile = async (key: string): Promise<GetObjectOutput> => {
  console.log(`Downloading file from S3 bucket "${fileBucket}" with key "${key}"`)
  const params: GetObjectCommandInput = {
    Bucket: fileBucket,
    Key: key,
  }

  try {
    return await s3.send(new GetObjectCommand(params))
  } catch (error) {
    console.error(error)
    throw error
  }
}

export const deleteFile = async (key: string): Promise<void> => {
  console.log(`Deleting form from S3 bucket "${fileBucket}" with key "${key}"`)
  const params: DeleteObjectCommandInput = {
    Bucket: fileBucket,
    Key: key,
  }

  try {
    await s3.send(new DeleteObjectCommand(params))
  } catch (error) {
    console.error(error)
    throw error
  }
}
