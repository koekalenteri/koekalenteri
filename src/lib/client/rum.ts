import { AwsRum } from 'aws-rum-web'

import pkg from '../../../package.json'
import { RUM_APPLICATION_ID, RUM_CONFIG, RUM_REGION } from '../../amplify-env'

let awsRum: AwsRum | undefined

export const rum = (): AwsRum | undefined => {
  if (RUM_APPLICATION_ID && !awsRum) {
    try {
      awsRum = new AwsRum(RUM_APPLICATION_ID, pkg.version, RUM_REGION, RUM_CONFIG)
    } catch (e) {
      console.error(e)
    }
  }

  return awsRum
}
