import React from "react";
import { Auth, route, user } from "./auth";

export type AuthenticatorContextValue = {
  service?: any;
};

const context: AuthenticatorContextValue = {
  service: {}
}

export const AuthenticatorContext: React.Context<AuthenticatorContextValue> =
  React.createContext({});

export function useAuthenticator() {
  return { route, user, sighOut: Auth.signOut };
}

export const Provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthenticatorContext.Provider value={context}>
      {children}
    </AuthenticatorContext.Provider>
  );
}

export const Authenticator = ({ children }: { children: React.ReactNode }) => {
  return (
    <Provider>
      {children}
    </Provider>
  );
}

Authenticator.Provider = Provider;
