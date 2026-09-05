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
import { logger } from './log'

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
    logger.debug('parsing file from event')
    const bb = Busboy({
      headers: {
        'content-type': event.headers['content-type'] ?? event.headers['Content-Type'],
      },
    })
    logger.debug('busboy initialized')

    const result: ParseResult = {
      data: undefined,
      error: null,
      fields: {},
      info: undefined,
    }
    const buffers: Uint8Array[] = []

    bb.on('file', (_name: string, file: Readable, info: FileInfo): void => {
      file.on('data', (data) => {
        logger.debug('file chunk received', { bytes: data.length })
        buffers.push(data)
      })

      file.on('end', () => {
        logger.debug('file ended')
        result.error = file.errored
        result.info = info
        result.data = Buffer.concat(buffers)
      })
    })

    bb.on('field', (name, value) => {
      logger.debug('field received', { field: name })
      result.fields[name] = value
    })

    bb.on('error', (error) => {
      logger.error('busboy failed to parse the request', { error })
      reject(new Error('bb error'))
    })
    bb.on('finish', () => {
      logger.debug('parse finished')
      resolve(result)
    })
    bb.write(event.body, event.isBase64Encoded ? 'base64' : 'binary')
    bb.end()
    logger.debug('parse end')
  })

export const uploadFile = async (key: string, buffer: PutObjectCommandInput['Body']): Promise<void> => {
  logger.info('uploading file to S3', { bucket: fileBucket, key })
  const params: PutObjectCommandInput = {
    Body: buffer,
    Bucket: fileBucket,
    ContentType: 'application/pdf',
    Key: key,
  }

  try {
    await s3.send(new PutObjectCommand(params))
  } catch (error) {
    logger.error('S3 upload failed', { bucket: fileBucket, error, key })
    throw error
  }
}

export const downloadFile = async (key: string): Promise<GetObjectOutput> => {
  logger.info('downloading file from S3', { bucket: fileBucket, key })
  const params: GetObjectCommandInput = {
    Bucket: fileBucket,
    Key: key,
  }

  try {
    return await s3.send(new GetObjectCommand(params))
  } catch (error) {
    logger.error('S3 download failed', { bucket: fileBucket, error, key })
    throw error
  }
}

export const deleteFile = async (key: string): Promise<void> => {
  logger.info('deleting file from S3', { bucket: fileBucket, key })
  const params: DeleteObjectCommandInput = {
    Bucket: fileBucket,
    Key: key,
  }

  try {
    await s3.send(new DeleteObjectCommand(params))
  } catch (error) {
    logger.error('S3 delete failed', { bucket: fileBucket, error, key })
    throw error
  }
}
