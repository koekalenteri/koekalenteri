import type { APIGatewayProxyEvent } from 'aws-lambda'
import type S3 from 'aws-sdk/clients/s3'
import type { GetObjectOutput } from 'aws-sdk/clients/s3'
import type { FileInfo } from 'busboy'
import type { Readable } from 'stream'

import s3client from 'aws-sdk/clients/s3'
import busboy from 'busboy'

const s3 = new s3client()

interface ParseResult {
  info?: FileInfo
  data: string
  fields: Record<string, string>
  error: Error | null
}

export const parsePostFile = (event: APIGatewayProxyEvent) =>
  new Promise<ParseResult>((resolve, reject) => {
    try {
      console.log('Parsing File from event with headers: ', event.headers)
      const bb = busboy({
        headers: {
          'content-type': event.headers['content-type'] ?? event.headers['Content-Type'],
        },
        limits: {
          fileSize: 20e6, // 20 MB
        },
      })

      const result: ParseResult = {
        fields: {},
        info: undefined,
        data: '',
        error: null,
      }

      bb.on('file', (_name: string, file: Readable, info: FileInfo): void => {
        file.on('data', (data) => {
          result.data = data
        })

        file.on('end', () => {
          result.error = file.errored
          result.info = info
        })
      })

      bb.on('field', (name, value) => {
        result.fields[name] = value
      })

      bb.on('error', (error) => {
        console.error(error)
        reject(error)
      })
      bb.on('finish', () => {
        resolve(result)
      })
    } catch (e) {
      console.error(e)
      reject(e)
    }
  })

export const uploadFile = (key: string, buffer: S3.Body) =>
  new Promise<void>((resolve, reject) => {
    try {
      console.log(`Uploading file to S3 bucket "${process.env.BUCKET ?? ''}" with key "${key}"`)
      const data: S3.Types.PutObjectRequest = {
        Bucket: process.env.BUCKET ?? '',
        Key: key,
        Body: buffer,
      }
      s3.putObject(data, (error) => {
        if (error) {
          console.error(error)
          return reject(error)
        }
        resolve()
      })
    } catch (e) {
      console.error(e)
      reject(e)
    }
  })

export const downloadFile = (key: string) =>
  new Promise<GetObjectOutput>((resolve, reject) => {
    console.log(`Downloading file from S3 bucket "${process.env.BUCKET ?? ''}" with key "${key}"`)
    try {
      s3.getObject({ Bucket: process.env.BUCKET ?? '', Key: key }, (error, data) => {
        if (error) {
          console.error(error)
          return reject(error)
        }
        resolve(data)
      })
    } catch (error) {
      reject(error)
    }
  })
