import { useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { getAuthSessionIdToken, isInvalidAuthSessionError } from '../lib/client/auth'
import { reportError } from '../lib/client/error'
import { isValidIdToken } from '../lib/token'
import { idTokenAtom } from '../pages/state/user/atoms'

const requiresInitialization = (idToken: string | undefined) => {
  return !idToken || !isValidIdToken(idToken)
}

export function useAuthSessionInitialization(idToken: string | undefined) {
  const setIdToken = useSetAtom(idTokenAtom)
  const initializationRef = useRef<Promise<string | undefined> | undefined>(undefined)
  const [initialized, setInitialized] = useState(() => !requiresInitialization(idToken))

  useEffect(() => {
    if (initialized) return

    let active = true
    const initialization = initializationRef.current ?? getAuthSessionIdToken()
    initializationRef.current = initialization

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
        if (active) setInitialized(true)
      })

    return () => {
      active = false
    }
  }, [idToken, initialized, setIdToken])

  return initialized
}
