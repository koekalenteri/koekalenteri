import type { Readable } from 'node:stream'
import type {
  DeleteObjectCommandInput,
  GetObjectCommandInput,
  GetObjectOutput,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { FileInfo } from 'busboy'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import Busboy from 'busboy'
import { CONFIG } from '../config'
import { logger } from './log'

const s3 = new S3Client()
const { fileBucket } = CONFIG

const MAX_FILE_SIZE = 5 * 1024 * 1024

export type UploadRejection = 'tooLarge' | 'tooManyFiles'

interface ParseResult {
  info?: FileInfo
  /** Never set on a rejected body: what Busboy kept of it is not the file that was sent. */
  data?: Buffer
  error: Error | null
  rejection?: UploadRejection
}

/** Busboy does not fail a body over its limits, it drops or cuts the part and tells only by an event. */
export const parsePostFile = (event: APIGatewayProxyEvent) =>
  new Promise<ParseResult>((resolve, reject) => {
    logger.debug('parsing file from event')
    const bb = Busboy({
      headers: {
        'content-type': event.headers['content-type'] ?? event.headers['Content-Type'],
      },
      // Busboy marks a file truncated on reaching the limit, also when the file ends right there, so
      // one byte more is what tells a file of exactly MAX_FILE_SIZE from a larger one.
      limits: { fields: 0, fileSize: MAX_FILE_SIZE + 1, files: 1 },
    })
    logger.debug('busboy initialized')

    const result: ParseResult = {
      data: undefined,
      error: null,
      info: undefined,
    }
    const buffers: Uint8Array[] = []

    bb.on('file', (_name: string, file: Readable, info: FileInfo): void => {
      file.on('data', (data) => {
        logger.debug('file chunk received', { bytes: data.length })
        buffers.push(data)
      })

      // A body cut off inside the file fails the form too, and bb's listener answers that. A stream
      // destroyed with an error and no listener would be an uncaught exception that ends the container.
      file.on('error', (error) => {
        logger.debug('file stream failed', { error })
      })

      file.on('limit', () => {
        result.rejection = 'tooLarge'
      })

      file.on('end', () => {
        logger.debug('file ended')
        result.error = file.errored
        result.info = info
        result.data = Buffer.concat(buffers)
      })
    })

    bb.on('filesLimit', () => {
      result.rejection = 'tooManyFiles'
    })

    bb.on('error', (error) => {
      logger.error('busboy failed to parse the request', { error })
      reject(new Error('bb error'))
    })
    bb.on('finish', () => {
      logger.debug('parse finished')
      resolve(result.rejection ? { ...result, data: undefined } : result)
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

/** Copies a file to the same key in another bucket: an event copy's attachments (KOE-1471). */
export const copyFileToBucket = async (key: string, bucket: string): Promise<void> => {
  logger.info('copying file to another bucket', { bucket, key })
  await s3.send(new CopyObjectCommand({ Bucket: bucket, CopySource: `${fileBucket}/${key}`, Key: key }))
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
