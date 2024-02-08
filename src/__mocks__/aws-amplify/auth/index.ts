const mockUser: any = {
  username: 'mock_user',
  attributes: {
    name: 'Test User',
    email: 'test@user.jest',
  },
}

export const signOut = () => undefined
export const getCurrentUser = async () => mockUser
export const fetchAuthSession = async () => ({ tokens: { idToken: { toString: () => 'id-token' } } })
