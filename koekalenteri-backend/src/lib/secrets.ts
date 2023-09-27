import type { KLAPIConfig } from '../types/KLAPI'
import type { PaytrailConfig } from '../types/paytrail'

import AWS from 'aws-sdk'

import { CONFIG } from '../config'

const { stackName } = CONFIG

const ssm = new AWS.SSM()

type ValuesOf<T extends string[]> = T[number]
type ParamsFromKeys<T extends string[]> = { [key in ValuesOf<T>]: string }

async function getSSMParams(names: string[]): Promise<ParamsFromKeys<typeof names>> {
  console.log('getSSMParams', names)
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

export const getPaytrailConfig = async (): Promise<PaytrailConfig> => {
  const cfg = (await getSSMParams([
    `${stackName}-PAYTRAIL_MERCHANT_ID`,
    `${stackName}-PAYTRAIL_SECRET`,
  ])) as PaytrailConfig
  if (!cfg.PAYTRAIL_SECRET) {
    throw new Error('Missing Paytrail Config!')
  }
  return cfg
}
