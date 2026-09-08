import { shouldIgnoreRumError } from '../../amplify-env'
import { recordError } from './rum'

export const reportError = (e: unknown) => {
  if (shouldIgnoreRumError(e)) {
    return
  }

  recordError(e, () => console.error('reportError', e))
}
