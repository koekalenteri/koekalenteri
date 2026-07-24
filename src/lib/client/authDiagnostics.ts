import { isTestEnv } from '../env'

export const authDebug = (message: string, details?: unknown) => {
  if (isTestEnv()) return

  if (details === undefined) {
    console.debug(message)
  } else {
    console.debug(message, details)
  }
}
