import AWS from 'aws-sdk'

import { KLAPIConfig } from './KLAPI_models'

const ssm = new AWS.SSM()

type ValuesOf<T extends string[]> = T[number]
type ParamsFromKeys<T extends string[]> = { [key in ValuesOf<T>]: string }

async function getSSMParams(names: string[]): Promise<ParamsFromKeys<typeof names>> {
  const result = await ssm.getParameters({ Names: names }).promise()
  const values: ParamsFromKeys<typeof names> = {}
  const params = result.Parameters || []
  for (const name of names) {
    values[name] = params.find((p) => p.Name === name)?.Value || ''
  }
  return values
}

export async function getKLAPIConfig(): Promise<KLAPIConfig> {
  const cfg = (await getSSMParams(['KL_API_URL', 'KL_API_UID', 'KL_API_PWD'])) as KLAPIConfig
  if (!cfg.KL_API_URL) {
    throw new Error('Missing KLAPI Config!')
  }
  return cfg
}
