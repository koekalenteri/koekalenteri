import { APIGatewayProxyEvent } from 'aws-lambda'
import s3client from 'aws-sdk/clients/s3'
import busboy, { FileInfo } from 'busboy'
import { Readable } from 'stream'

const s3 = new s3client()

interface ParseResult {
  info?: FileInfo
  data: string
  fields: Record<string, string>
  error: Error | null
}

export const parsePostFile = (event: APIGatewayProxyEvent) =>
  new Promise<ParseResult>((resolve, reject) => {
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

    bb.on('error', (error) => reject(error))
    bb.on('finish', () => {
      resolve(result)
    })
  })

export const uploadFile = (key: string, buffer: any) =>
  new Promise<void>((resolve, reject) => {
    const data = {
      Bucket: process.env.BUCKET ?? '',
      Key: key,
      Body: buffer,
    }
    s3.putObject(data, (error) => {
      if (!error) {
        resolve()
      } else {
        reject(new Error('error during put'))
      }
    })
  })
