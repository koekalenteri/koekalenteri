import type { APIGatewayProxyEvent } from 'aws-lambda'
import type S3 from 'aws-sdk/clients/s3'
import type { GetObjectOutput } from 'aws-sdk/clients/s3'
import type { FileInfo } from 'busboy'
import type { Readable } from 'stream'

import s3client from 'aws-sdk/clients/s3'
import Busboy from 'busboy'

const s3 = new s3client()

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
      fields: {},
      info: undefined,
      data: undefined,
      error: null,
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
      reject(error)
    })
    bb.on('finish', () => {
      console.log('on finish')
      resolve(result)
    })
    bb.write(event.body, event.isBase64Encoded ? 'base64' : 'binary')
    bb.end()
    console.log('parse end')
  })

export const uploadFile = (key: string, buffer: S3.Body) =>
  new Promise<void>((resolve, reject) => {
    console.log(`Uploading file to S3 bucket "${process.env.BUCKET ?? ''}" with key "${key}"`)
    const data: S3.Types.PutObjectRequest = {
      Bucket: process.env.BUCKET ?? '',
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    }
    s3.putObject(data, (error) => {
      if (error) {
        console.error(error)
        return reject(error)
      }
      resolve()
    })
  })

export const downloadFile = (key: string) =>
  new Promise<GetObjectOutput>((resolve, reject) => {
    console.log(`Downloading file from S3 bucket "${process.env.BUCKET ?? ''}" with key "${key}"`)
    s3.getObject({ Bucket: process.env.BUCKET ?? '', Key: key }, (error, data) => {
      if (error) {
        console.error(error)
        return reject(error)
      }
      resolve(data)
    })
  })

export const deleteFile = (key: string) =>
  new Promise((resolve, reject) => {
    console.log(`Deleting form from S3 bucket "${process.env.BUCKET ?? ''}" with key "${key}"`)
    s3.deleteObject({ Bucket: process.env.BUCKET ?? '', Key: key }, (error, data) => {
      if (error) {
        console.error(error)
        return reject(error)
      }
      resolve(data)
    })
  })
