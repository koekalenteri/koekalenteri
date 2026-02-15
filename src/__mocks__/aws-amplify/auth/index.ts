const mockUser = {
  attributes: {
    email: 'test@user.jest',
    name: 'Test User',
  },
  username: 'mock_user',
}

export const signOut = () => undefined
export const getCurrentUser = async () => mockUser
export const fetchAuthSession = async () => ({ tokens: { idToken: { toString: () => 'id-token' } } })
