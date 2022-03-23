import React, { createContext, useContext, useMemo, useState } from "react";

const AuthenticatorContext = createContext({
  route: 'idle',
  signOut: () => {
    // noop
  }
});

const mockUser: any = {
  username: 'mock_user',
  attributes: {
    name: 'Test User',
    email: 'test@user.jest'
  }
};

export const useAuthenticator = () => useContext(AuthenticatorContext);

export const Provider = ({ children }: { children: React.ReactNode }) => {
  const [route, setRoute] = useState('authenticated');
  const user = useMemo(() => route === 'authenticated' ? mockUser : undefined, [route]);
  const state = useMemo(() => ({ route, user, signOut: () => setRoute('idle') }), [route, user]);
  return (
    <AuthenticatorContext.Provider value={state}>
      {children}
    </AuthenticatorContext.Provider>
  );
}

export const Authenticator = ({ children }: { children: React.ReactNode }) => {
  return (
    <Provider>
      <p>MOCK AUTHENTICATOR</p>
      {children}
    </Provider>
  );
}

Authenticator.Provider = Provider;
