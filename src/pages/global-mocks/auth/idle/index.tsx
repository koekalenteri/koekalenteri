import type React from 'react'
import { createContext, useContext, useMemo, useState } from 'react'

const AuthenticatorContext = createContext({
  route: 'idle',
  signOut: () => {
    // noop
  },
})

const mockUser: any = {
  attributes: {
    email: 'test@user.jest',
    name: 'Test User',
  },
  username: 'mock_user',
}

export const useAuthenticator = () => useContext(AuthenticatorContext)

export const Provider = ({ children }: { readonly children: React.ReactNode }) => {
  const [route, setRoute] = useState('idle')
  const user = useMemo(() => (route === 'authenticated' ? mockUser : undefined), [route])
  const state = useMemo(() => ({ route, signOut: () => setRoute('idle'), user }), [route, user])
  return <AuthenticatorContext.Provider value={state}>{children}</AuthenticatorContext.Provider>
}

export const Authenticator = ({ children }: { readonly children: React.ReactNode }) => {
  return (
    <Provider>
      <p>MOCK AUTHENTICATOR</p>
      {children}
    </Provider>
  )
}

Authenticator.Provider = Provider

export const signOut = () => undefined
export const getCurrentUser = async () => mockUser
export const fetchAuthSession = async () => ({ tokens: { idToken: { toString: () => 'id-token' } } })
