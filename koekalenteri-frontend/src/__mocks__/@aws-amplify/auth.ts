export const route = 'authenticated';
export const user = {
  attributes: {
    name: 'Test User',
    email: 'test@user.jest'
  }
};

export const Auth = {
  signUp: jest.fn(),
  signIn: jest.fn(),
  currentSession: jest.fn(),
  confirmSignUp: jest.fn(),
  signOut: jest.fn(),
  resendSignUp: jest.fn(),
  completeNewPassword: jest.fn(),
  currentAuthenticatedUser: jest.fn(),
  configure: jest.fn()
};
