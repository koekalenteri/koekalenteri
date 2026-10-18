import { screen } from '@testing-library/react'
import { openRoute, setUpAuthenticator, user } from './authenticatorRoutes'

/** Texts Amplify assembles as it draws, which a vocabulary entry alone cannot show are right. */
describe('the Authenticator in Finnish', () => {
  setUpAuthenticator()

  it('tells where the sign-up code went, in one Finnish message', async () => {
    await openRoute('confirmSignUp')

    expect(
      screen.getByText(
        'Koodi on matkalla. Kirjaudu sisään syöttämällä koodi, jonka lähetimme osoitteeseen h***@e***. Sen saapumisessa voi kestää hetki.'
      )
    ).toBeInTheDocument()
  })

  // The user pool's password policy, checked before Cognito refuses the password in English.
  it.each([
    ['Sala1', 'Salasanassa on oltava vähintään 8 merkkiä'],
    ['SALASANA1', 'Salasanassa on oltava pieniä kirjaimia'],
    ['salasana1', 'Salasanassa on oltava isoja kirjaimia'],
    ['Salasanaa', 'Salasanassa on oltava numeroita'],
  ])('refuses the sign-up password %s: %s', async (password, message) => {
    await openRoute('signUp')

    await user.type(screen.getByLabelText('Sähköposti'), 'h@e.fi')
    await user.type(screen.getByLabelText('Salasana'), password)
    await user.tab()

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
