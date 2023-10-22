const mockUser: any = {
  username: 'mock_user',
  attributes: {
    name: 'Test User',
    email: 'test@user.jest',
  },
  getSignInUserSession: () => ({
    getIdToken: () => ({
      getJwtToken: () => 'test-token',
    }),
  }),
}

export const Auth = {
  signOut: () => undefined,
  currentAuthenticatedUser: async () => mockUser,
}
