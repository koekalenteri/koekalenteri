import { useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { getAuthSessionIdToken, isInvalidAuthSessionError } from '../lib/client/auth'
import { reportError } from '../lib/client/error'
import { isValidIdToken } from '../lib/token'
import { idTokenAtom } from '../pages/state/user/atoms'

const requiresInitialization = (idToken: string | undefined) => {
  return !idToken || !isValidIdToken(idToken)
}

// Public, token-authenticated pages (e.g. confirming a registration via an emailed link) don't
// need a resolved Amplify session at all. Without this cap, a hung fetchAuthSession() (flaky
// network, stale service worker, ...) blocks the entire app -- including those public routes --
// behind the app-wide loading spinner forever, since RouterProvider only mounts once initialized.
const AUTH_SESSION_INIT_TIMEOUT_MS = 8_000

export function useAuthSessionInitialization(idToken: string | undefined) {
  const setIdToken = useSetAtom(idTokenAtom)
  const initializationRef = useRef<Promise<string | undefined> | undefined>(undefined)
  const [initialized, setInitialized] = useState(() => !requiresInitialization(idToken))

  // biome-ignore lint/correctness/useExhaustiveDependencies: this effect is the sole writer of `initialized`; including it would tear down the still-pending initialization the instant the timeout below flips it
  useEffect(() => {
    if (initialized) return

    let active = true
    const initialization = initializationRef.current ?? getAuthSessionIdToken()
    initializationRef.current = initialization

    const timeoutId = setTimeout(() => {
      if (active) setInitialized(true)
    }, AUTH_SESSION_INIT_TIMEOUT_MS)

    void initialization
      .then((nextToken) => {
        if (!active) return

        if (nextToken) {
          setIdToken((current) => (current === nextToken ? current : nextToken))
        } else {
          setIdToken((current) => (current === idToken ? undefined : current))
        }
      })
      .catch((error) => {
        if (!active) return

        if (isInvalidAuthSessionError(error)) {
          setIdToken((current) => (current === idToken ? undefined : current))
        } else {
          reportError(error)
        }
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (active) setInitialized(true)
      })

    return () => {
      active = false
      clearTimeout(timeoutId)
    }
  }, [idToken, setIdToken])

  return initialized
}
