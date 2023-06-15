import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Auth } from '@aws-amplify/auth'
import { useSetRecoilState } from 'recoil'

import { idTokenAtom } from './atoms'

export const useUserActions = () => {
  const navigate = useNavigate()
  const setIdToken = useSetRecoilState(idTokenAtom)

  const signIn = useCallback(
    async (idToken: string) => {
      setIdToken(idToken)
      navigate('/', { replace: true })
    },
    [navigate, setIdToken]
  )

  const signOut = useCallback(() => {
    Auth.signOut().then(
      () => {
        setIdToken(undefined)
        navigate('/', { replace: true })
      },
      (reason) => console.error(reason)
    )
  }, [navigate, setIdToken])

  return { signIn, signOut }
}
