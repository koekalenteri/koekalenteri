import { rum } from './rum'

export const reportError = (e: unknown) => {
  const r = rum()
  if (r) {
    r.recordError(e)
  } else {
    console.error('reportError', e)
  }
}
