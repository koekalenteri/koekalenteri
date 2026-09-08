import type { AwsRum } from 'aws-rum-web'
import pkg from '../../../package.json'
import { RUM_APPLICATION_ID, RUM_CONFIG, RUM_REGION } from '../../amplify-env'

let instance: Promise<AwsRum | undefined> | undefined

/**
 * Loads the RUM client on demand. Statically imported it sat in the initial chunk of the public
 * calendar, ahead of anything the visitor came for; a page view recorded a moment later costs
 * nothing. Callers therefore hand in what they want recorded instead of holding the instance.
 */
const load = async (): Promise<AwsRum | undefined> => {
  if (!RUM_APPLICATION_ID) return undefined

  try {
    const { AwsRum } = await import(/* webpackChunkName: "rum" */ 'aws-rum-web')

    return new AwsRum(RUM_APPLICATION_ID, pkg.version, RUM_REGION, RUM_CONFIG)
  } catch (e) {
    console.error(e)

    return undefined
  }
}

const withRum = (write: (rum: AwsRum) => void, whenUnavailable?: () => void): void => {
  if (!RUM_APPLICATION_ID) {
    whenUnavailable?.()

    return
  }

  instance ??= load()
  instance.then((rum) => (rum ? write(rum) : whenUnavailable?.())).catch(() => whenUnavailable?.())
}

export const recordPageView = (path: string): void => withRum((rum) => rum.recordPageView(path))

export const recordEvent = (type: string, data: object): void => withRum((rum) => rum.recordEvent(type, data))

export const recordError = (error: unknown, whenUnavailable?: () => void): void =>
  withRum((rum) => rum.recordError(error), whenUnavailable)
