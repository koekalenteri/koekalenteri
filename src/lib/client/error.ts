import { shouldIgnoreRumError } from '../../amplify-env'
import { rum } from './rum'

export const reportError = (e: unknown) => {
  if (shouldIgnoreRumError(e)) {
    return
  }

  const r = rum()
  if (r) {
    r.recordError(e)
  } else {
    console.error('reportError', e)
  }
}
