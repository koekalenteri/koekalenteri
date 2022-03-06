export const route = 'authenticated';
export const user = {
  attributes: {
    name: 'Test User',
    email: 'test@user.jest'
  }
};

export const Auth = {
  signUp,
  signIn,
  currentSession,
  confirmSignUp,
  signOut,
  resendSignUp,
  completeNewPassword: jest.fn(),
  currentAuthenticatedUser: jest.fn(),
  configure: jest.fn()
};

function signUp(email: any) {
}

function signIn(email: any) {
}

function currentSession() {
}

function confirmSignUp() {
}

function signOut() {
}

function resendSignUp() {
}
