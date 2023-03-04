const mockUser: any = {
  username: 'mock_user',
  attributes: {
    name: 'Test User',
    email: 'test@user.jest',
  },
}

export const Auth = {
  signOut: () => undefined,
  currentAuthenticatedUser: async () => mockUser,
}
